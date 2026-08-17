package backup_test

import (
	"bytes"
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
	teststore "github.com/yourselfhosted/slash/store/test"
)

func testProfile() *profile.Profile {
	return &profile.Profile{Mode: "prod"}
}

func exportAll(ctx context.Context, t *testing.T, ts *store.Store) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, backup.Export(ctx, ts, testProfile(), backup.ExportOptions{IncludeActivities: true}, &buf))
	return buf.Bytes()
}

// TestRoundTripPreservesEverything is the point of the whole format: what comes
// back must be indistinguishable from what went in, IDs included, since
// creator_id and collection.shortcut_ids are references that are never rewritten.
func TestRoundTripPreservesEverything(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	sourceUser := seed(ctx, t, source)

	sourceShortcuts, err := source.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	sourceCollections, err := source.ListCollections(ctx, &store.FindCollection{})
	require.NoError(t, err)

	raw := exportAll(ctx, t, source)

	// A different, empty instance — the only thing a restore accepts.
	target := teststore.NewTestingStore(ctx, t)
	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(raw)))

	users, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, sourceUser.ID, users[0].ID, "user IDs must survive verbatim")
	require.Equal(t, sourceUser.Email, users[0].Email)
	require.Equal(t, sourceUser.PasswordHash, users[0].PasswordHash, "password hashes must survive, or nobody can sign in")
	require.Equal(t, sourceUser.Role, users[0].Role)
	require.Equal(t, sourceUser.CreatedTs, users[0].CreatedTs, "timestamps must survive")

	shortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Len(t, shortcuts, 1)
	require.Equal(t, sourceShortcuts[0].Id, shortcuts[0].Id)
	require.Equal(t, sourceShortcuts[0].Name, shortcuts[0].Name)
	require.Equal(t, sourceShortcuts[0].Link, shortcuts[0].Link)
	require.Equal(t, sourceShortcuts[0].Tags, shortcuts[0].Tags)
	require.Equal(t, sourceShortcuts[0].CreatorId, shortcuts[0].CreatorId)
	require.Equal(t, sourceShortcuts[0].CreatedTs, shortcuts[0].CreatedTs)

	collections, err := target.ListCollections(ctx, &store.FindCollection{})
	require.NoError(t, err)
	require.Len(t, collections, 1)
	// The field whose storage representation differs per driver.
	require.Equal(t, sourceCollections[0].ShortcutIds, collections[0].ShortcutIds)
	require.Equal(t, sourceCollections[0].Id, collections[0].Id)

	activities, err := target.ListActivities(ctx, &store.FindActivity{})
	require.NoError(t, err)
	require.Len(t, activities, 1)

	setting, err := target.GetWorkspaceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "https://s.example.com", setting.InstanceUrl)
}

// TestRestoreLeavesIDsUsable guards the sequence reset: a restored instance must
// still be able to create new rows without colliding with restored IDs.
func TestRestoreLeavesIDsUsable(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	target := teststore.NewTestingStore(ctx, t)
	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(raw)))

	users, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)

	created, err := target.CreateShortcut(ctx, &storepb.Shortcut{
		CreatorId:  users[0].ID,
		Name:       "fresh",
		Link:       "https://example.com",
		Visibility: storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err, "creating a shortcut after a restore must not collide with a restored ID")

	shortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Len(t, shortcuts, 2)
	require.NotEqual(t, int32(0), created.Id)
}

func TestRestoreRefusesNonEmptyInstance(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	// The target already has content of its own.
	target := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, target)

	err := backup.Restore(ctx, target, bytes.NewReader(raw))
	require.ErrorIs(t, err, backup.ErrNotEmpty)

	// And nothing was touched.
	shortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Len(t, shortcuts, 1)
}

func TestRestoreAllowsSingleAdminInstance(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	// A fresh install: one admin exists, because someone had to sign in to start
	// the restore. That admin is replaced by the backup's own users.
	target := teststore.NewTestingStore(ctx, t)
	_, err := target.CreateUser(ctx, &store.User{
		Email: "installer@slash.com", Nickname: "installer", PasswordHash: "x", Role: store.RoleAdmin,
	})
	require.NoError(t, err)

	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(raw)))

	users, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, "admin@slash.com", users[0].Email, "the installing admin is replaced wholesale")
}

func TestRestoreRejectsVersionMismatch(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	tampered := bytes.ReplaceAll(gunzipForTest(t, raw), []byte(`"schemaVersion":"`), []byte(`"schemaVersion":"0.9.`))
	target := teststore.NewTestingStore(ctx, t)

	err := backup.Restore(ctx, target, bytes.NewReader(gzipForTest(t, tampered)))
	var mismatch *backup.VersionMismatchError
	require.ErrorAs(t, err, &mismatch)
	require.Contains(t, err.Error(), "Restore it with that version of Slash first")
}

func TestRestoreRejectsGarbage(t *testing.T) {
	ctx := context.Background()
	target := teststore.NewTestingStore(ctx, t)

	err := backup.Restore(ctx, target, bytes.NewReader([]byte("this is not a gzip file")))
	require.ErrorContains(t, err, "not a valid gzip file")
}

// TestRestoreIsAtomic checks the promise that a failure leaves the target
// exactly as it was, by corrupting a record part-way through the file.
func TestRestoreIsAtomic(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	// Point a shortcut record at a table that does not exist.
	broken := bytes.Replace(gunzipForTest(t, raw), []byte(`{"table":"shortcut"`), []byte(`{"table":"bogus"`), 1)

	target := teststore.NewTestingStore(ctx, t)
	installer, err := target.CreateUser(ctx, &store.User{
		Email: "installer@slash.com", Nickname: "installer", PasswordHash: "x", Role: store.RoleAdmin,
	})
	require.NoError(t, err)

	err = backup.Restore(ctx, target, bytes.NewReader(gzipForTest(t, broken)))
	require.ErrorContains(t, err, "bogus")

	// The DeleteAll that ran first must have been rolled back with everything else.
	users, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, installer.ID, users[0].ID, "a failed restore must not destroy the existing instance")
}
