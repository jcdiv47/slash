package teststore

import (
	"context"
	"testing"

	"github.com/pkg/errors"
	"github.com/stretchr/testify/require"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

// TestExportTxIsIsolatedFromConcurrentWrites pins the guarantee an export
// depends on: every table is read from one point in time, so a Workspace that
// changes mid-export cannot land half-old, half-new rows in the same Backup.
//
// The writes below happen after the snapshot is taken but before the export has
// read either table, which is exactly the window a per-statement read would
// leak.
func TestExportTxIsIsolatedFromConcurrentWrites(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingAdminUser(ctx, ts)
	require.NoError(t, err)

	_, err = ts.CreateShortcut(ctx, &storepb.Shortcut{
		CreatorId:  user.ID,
		Name:       "before",
		Link:       "https://example.com",
		Visibility: storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)

	tx, err := ts.BeginExport(ctx)
	require.NoError(t, err)
	defer tx.Rollback()

	_, err = ts.CreateShortcut(ctx, &storepb.Shortcut{
		CreatorId:  user.ID,
		Name:       "after",
		Link:       "https://example.com",
		Visibility: storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)
	_, err = ts.CreateActivity(ctx, &store.Activity{
		CreatorID: user.ID,
		Type:      store.ActivityShortcutView,
		Level:     store.ActivityInfo,
		Payload:   `{"shortcutId":2}`,
	})
	require.NoError(t, err)
	_, err = ts.CreateCollection(ctx, &storepb.Collection{
		CreatorId:   user.ID,
		Name:        "after",
		ShortcutIds: []int32{2},
		Visibility:  storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)

	shortcuts, err := tx.ListShortcuts(ctx)
	require.NoError(t, err)
	require.Len(t, shortcuts, 1)
	require.Equal(t, "before", shortcuts[0].Name)

	collections, err := tx.ListCollections(ctx)
	require.NoError(t, err)
	require.Empty(t, collections)

	activities := []*store.Activity{}
	require.NoError(t, tx.ScanActivities(ctx, func(activity *store.Activity) error {
		activities = append(activities, activity)
		return nil
	}))
	require.Empty(t, activities)
}

// TestExportTxReadsEveryTable checks the snapshot still returns the rows an
// export needs, isolation aside.
func TestExportTxReadsEveryTable(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingAdminUser(ctx, ts)
	require.NoError(t, err)

	shortcut, err := ts.CreateShortcut(ctx, &storepb.Shortcut{
		CreatorId:  user.ID,
		Name:       "gh",
		Link:       "https://github.com",
		Tags:       []string{"code", "work"},
		Visibility: storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)
	_, err = ts.CreateCollection(ctx, &storepb.Collection{
		CreatorId:   user.ID,
		Name:        "tools",
		ShortcutIds: []int32{shortcut.Id, 999},
		Visibility:  storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)
	_, err = ts.UpsertWorkspaceSetting(ctx, &storepb.WorkspaceSetting{
		Key:   storepb.WorkspaceSettingKey_WORKSPACE_SETTING_GENERAL,
		Value: &storepb.WorkspaceSetting_General{General: &storepb.WorkspaceSetting_GeneralSetting{InstanceUrl: "https://s.example.com"}},
	})
	require.NoError(t, err)
	_, err = ts.UpsertUserSetting(ctx, &storepb.UserSetting{
		UserId: user.ID,
		Key:    storepb.UserSettingKey_USER_SETTING_ACCESS_TOKENS,
		Value: &storepb.UserSetting_AccessTokens{AccessTokens: &storepb.UserSetting_AccessTokensSetting{
			AccessTokens: []*storepb.UserSetting_AccessTokensSetting_AccessToken{{AccessToken: "token", Description: "cli"}},
		}},
	})
	require.NoError(t, err)
	activity, err := ts.CreateActivity(ctx, &store.Activity{
		CreatorID: user.ID,
		Type:      store.ActivityShortcutView,
		Level:     store.ActivityInfo,
		Payload:   `{"shortcutId":1}`,
	})
	require.NoError(t, err)

	tx, err := ts.BeginExport(ctx)
	require.NoError(t, err)
	defer tx.Rollback()

	users, err := tx.ListUsers(ctx)
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, user.PasswordHash, users[0].PasswordHash)

	userSettings, err := tx.ListUserSettings(ctx)
	require.NoError(t, err)
	require.Len(t, userSettings, 1)
	require.Equal(t, "token", userSettings[0].GetAccessTokens().AccessTokens[0].AccessToken)

	workspaceSettings, err := tx.ListWorkspaceSettings(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, workspaceSettings)

	shortcuts, err := tx.ListShortcuts(ctx)
	require.NoError(t, err)
	require.Len(t, shortcuts, 1)
	require.Equal(t, []string{"code", "work"}, shortcuts[0].Tags)

	collections, err := tx.ListCollections(ctx)
	require.NoError(t, err)
	require.Len(t, collections, 1)
	// The representation that differs per driver: comma-joined text vs int[].
	require.Equal(t, []int32{shortcut.Id, 999}, collections[0].ShortcutIds)

	scanned := []*store.Activity{}
	require.NoError(t, tx.ScanActivities(ctx, func(a *store.Activity) error {
		scanned = append(scanned, a)
		return nil
	}))
	require.Len(t, scanned, 1)
	require.Equal(t, activity, scanned[0])
}

// TestExportTxScanActivitiesPropagatesError makes sure a write failure part way
// through the activity stream aborts the export rather than being swallowed.
func TestExportTxScanActivitiesPropagatesError(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingAdminUser(ctx, ts)
	require.NoError(t, err)
	for i := 0; i < 3; i++ {
		_, err = ts.CreateActivity(ctx, &store.Activity{
			CreatorID: user.ID,
			Type:      store.ActivityShortcutView,
			Level:     store.ActivityInfo,
			Payload:   `{"shortcutId":1}`,
		})
		require.NoError(t, err)
	}

	tx, err := ts.BeginExport(ctx)
	require.NoError(t, err)
	defer tx.Rollback()

	boom := errors.New("boom")
	seen := 0
	err = tx.ScanActivities(ctx, func(*store.Activity) error {
		seen++
		return boom
	})
	require.ErrorIs(t, err, boom)
	require.Equal(t, 1, seen)
}
