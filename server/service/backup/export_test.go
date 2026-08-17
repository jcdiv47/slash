package backup_test

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
	teststore "github.com/yourselfhosted/slash/store/test"
)

// readBackup unzips a backup and splits it into its manifest and its records,
// grouped by table.
func readBackup(t *testing.T, raw []byte) (*backup.Manifest, map[string][]json.RawMessage) {
	t.Helper()

	gzipReader, err := gzip.NewReader(bytes.NewReader(raw))
	require.NoError(t, err)
	defer gzipReader.Close()

	scanner := bufio.NewScanner(gzipReader)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	require.True(t, scanner.Scan(), "backup is empty")
	manifest := &backup.Manifest{}
	require.NoError(t, json.Unmarshal(scanner.Bytes(), manifest))

	records := map[string][]json.RawMessage{}
	for scanner.Scan() {
		record := &backup.Record{}
		require.NoError(t, json.Unmarshal(scanner.Bytes(), record))
		records[record.Table] = append(records[record.Table], record.Data)
	}
	require.NoError(t, scanner.Err())

	return manifest, records
}

// seed populates a store with one of everything worth exporting.
func seed(ctx context.Context, t *testing.T, ts *store.Store) *store.User {
	t.Helper()

	user, err := ts.CreateUser(ctx, &store.User{
		Email:        "admin@slash.com",
		Nickname:     "admin",
		PasswordHash: "hash-that-must-survive",
		Role:         store.RoleAdmin,
	})
	require.NoError(t, err)

	shortcut, err := ts.CreateShortcut(ctx, &storepb.Shortcut{
		CreatorId:  user.ID,
		Name:       "gh",
		Link:       "https://github.com",
		Title:      "GitHub",
		Tags:       []string{"code", "work"},
		Visibility: storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)

	_, err = ts.CreateCollection(ctx, &storepb.Collection{
		CreatorId: user.ID,
		Name:      "tools",
		Title:     "Tools",
		// The comma-joined vs int[] divergence this format exists to paper over.
		ShortcutIds: []int32{shortcut.Id, 999},
		Visibility:  storepb.Visibility_WORKSPACE,
	})
	require.NoError(t, err)

	_, err = ts.UpsertWorkspaceSetting(ctx, &storepb.WorkspaceSetting{
		Key:   storepb.WorkspaceSettingKey_WORKSPACE_SETTING_GENERAL,
		Value: &storepb.WorkspaceSetting_General{General: &storepb.WorkspaceSetting_GeneralSetting{InstanceUrl: "https://s.example.com"}},
	})
	require.NoError(t, err)

	_, err = ts.CreateActivity(ctx, &store.Activity{
		CreatorID: user.ID,
		Type:      store.ActivityShortcutView,
		Level:     store.ActivityInfo,
		Payload:   `{"shortcutId":1}`,
	})
	require.NoError(t, err)

	return user
}

func TestExportWritesEveryTable(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	user := seed(ctx, t, ts)

	var buf bytes.Buffer
	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{IncludeActivities: true}, &buf)
	require.NoError(t, err)

	manifest, records := readBackup(t, buf.Bytes())

	require.Equal(t, backup.FormatVersion, manifest.Format)
	require.NotEmpty(t, manifest.SlashVersion)
	require.NotEmpty(t, manifest.SchemaVersion)
	require.NotZero(t, manifest.CreatedTs)

	// Users must precede the rows referencing them, so a restore can replay the
	// file in order without deferring constraints.
	require.Equal(t, []string{"user", "user_setting", "workspace_setting", "shortcut", "collection", "activity"}, manifest.Tables)

	require.Len(t, records[backup.TableUser], 1)
	require.Len(t, records[backup.TableShortcut], 1)
	require.Len(t, records[backup.TableCollection], 1)
	require.Len(t, records[backup.TableActivity], 1)
	require.NotEmpty(t, records[backup.TableWorkspaceSetting])

	// Secrets are carried verbatim, per ADR 0005.
	exportedUser := &store.User{}
	require.NoError(t, json.Unmarshal(records[backup.TableUser][0], exportedUser))
	require.Equal(t, user.ID, exportedUser.ID)
	require.Equal(t, "hash-that-must-survive", exportedUser.PasswordHash)
	require.Equal(t, store.RoleAdmin, exportedUser.Role)

	// The repeated field that has a different storage representation per driver.
	exportedCollection := &storepb.Collection{}
	require.NoError(t, protojson.Unmarshal(records[backup.TableCollection][0], exportedCollection))
	require.Equal(t, []int32{1, 999}, exportedCollection.ShortcutIds)

	exportedShortcut := &storepb.Shortcut{}
	require.NoError(t, protojson.Unmarshal(records[backup.TableShortcut][0], exportedShortcut))
	require.Equal(t, "gh", exportedShortcut.Name)
	require.Equal(t, []string{"code", "work"}, exportedShortcut.Tags)
}

func TestExportExcludesActivitiesByDefault(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, ts)

	var buf bytes.Buffer
	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{}, &buf)
	require.NoError(t, err)

	manifest, records := readBackup(t, buf.Bytes())

	require.NotContains(t, manifest.Tables, backup.TableActivity)
	require.Empty(t, records[backup.TableActivity])
	// Everything else still ships.
	require.Len(t, records[backup.TableUser], 1)
	require.Len(t, records[backup.TableShortcut], 1)
}

func TestExportOfEmptyWorkspaceIsReadable(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)

	var buf bytes.Buffer
	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{IncludeActivities: true}, &buf)
	require.NoError(t, err)

	manifest, records := readBackup(t, buf.Bytes())
	require.Equal(t, backup.FormatVersion, manifest.Format)
	require.Empty(t, records[backup.TableUser])
}

// TestExportRecordsAreSingleLines guards the NDJSON invariant: protojson injects
// random whitespace, and any newline inside a record would desynchronise a
// line-oriented reader.
func TestExportRecordsAreSingleLines(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, ts)

	var buf bytes.Buffer
	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{IncludeActivities: true}, &buf)
	require.NoError(t, err)

	gzipReader, err := gzip.NewReader(bytes.NewReader(buf.Bytes()))
	require.NoError(t, err)
	defer gzipReader.Close()
	plain, err := io.ReadAll(gzipReader)
	require.NoError(t, err)

	for _, line := range bytes.Split(bytes.TrimRight(plain, "\n"), []byte("\n")) {
		require.True(t, json.Valid(line), "every line must be valid JSON on its own: %s", line)
	}
}
