package backup_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
	teststore "github.com/yourselfhosted/slash/store/test"
)

// splitBackup and joinBackup let a test take a real backup apart and put it back
// together with one thing changed, so each malformed-input case reads as the
// single defect it is rather than as a string substitution.
func splitBackup(t *testing.T, raw []byte) (*backup.Manifest, [][]byte) {
	t.Helper()

	scanner := bufio.NewScanner(bytes.NewReader(gunzipForTest(t, raw)))
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	require.True(t, scanner.Scan(), "backup is empty")
	manifest := &backup.Manifest{}
	require.NoError(t, json.Unmarshal(scanner.Bytes(), manifest))

	var records [][]byte
	for scanner.Scan() {
		records = append(records, append([]byte(nil), scanner.Bytes()...))
	}
	require.NoError(t, scanner.Err())

	return manifest, records
}

func joinBackup(t *testing.T, manifest *backup.Manifest, records [][]byte) []byte {
	t.Helper()

	var plain bytes.Buffer
	encoder := json.NewEncoder(&plain)
	require.NoError(t, encoder.Encode(manifest))
	for _, record := range records {
		plain.Write(record)
		plain.WriteByte('\n')
	}
	return gzipForTest(t, plain.Bytes())
}

// tamperedBackup is a valid backup of a seeded workspace with the manifest
// edited, ready to be handed to a restore that must refuse it.
func tamperedBackup(ctx context.Context, t *testing.T, edit func(*backup.Manifest)) []byte {
	t.Helper()

	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)

	manifest, records := splitBackup(t, exportAll(ctx, t, source))
	edit(manifest)
	return joinBackup(t, manifest, records)
}

// restoreTampered runs a restore of an edited backup against a target holding
// only the admin who would have started it, and returns that target alongside
// the failure so a caller can check nothing was destroyed.
func restoreTampered(ctx context.Context, t *testing.T, raw []byte) (*store.Store, error) {
	t.Helper()

	target := teststore.NewTestingStore(ctx, t)
	installAdmin(ctx, t, target)

	return target, backup.Restore(ctx, target, bytes.NewReader(raw))
}

func TestRestoreRejectsManifestOmittingRequiredTable(t *testing.T) {
	ctx := context.Background()
	raw := tamperedBackup(ctx, t, func(manifest *backup.Manifest) {
		manifest.Tables = []string{
			backup.TableUser, backup.TableUserSetting, backup.TableWorkspaceSetting,
			backup.TableShortcut, backup.TableActivity,
		}
	})

	target, err := restoreTampered(ctx, t, raw)
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, backup.TableCollection)
	requireUntouched(ctx, t, target)
}

// TestRestoreAcceptsManifestOmittingActivity is the other half of the rule:
// activity is the one table an export may leave out, so a manifest without it is
// complete rather than partial. See ADR 0003.
func TestRestoreAcceptsManifestOmittingActivity(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)

	var buf bytes.Buffer
	require.NoError(t, backup.Export(ctx, source, testProfile(), backup.ExportOptions{IncludeActivities: false}, &buf))

	target := teststore.NewTestingStore(ctx, t)
	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(buf.Bytes())))

	activities, err := target.ListActivities(ctx, &store.FindActivity{})
	require.NoError(t, err)
	require.Empty(t, activities)

	shortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Len(t, shortcuts, 1)
}

func TestRestoreRejectsDuplicateTableDeclaration(t *testing.T) {
	ctx := context.Background()
	raw := tamperedBackup(ctx, t, func(manifest *backup.Manifest) {
		manifest.Tables = append(manifest.Tables, backup.TableShortcut)
	})

	target, err := restoreTampered(ctx, t, raw)
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, "more than once")
	requireUntouched(ctx, t, target)
}

func TestRestoreRejectsUnsupportedTableDeclaration(t *testing.T) {
	ctx := context.Background()
	raw := tamperedBackup(ctx, t, func(manifest *backup.Manifest) {
		manifest.Tables = append(manifest.Tables, "folder")
	})

	target, err := restoreTampered(ctx, t, raw)
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, "folder")
	requireUntouched(ctx, t, target)
}

// TestRestoreRejectsOutOfOrderTableDeclaration guards the ordering the format
// relies on: records are replayed in the order the manifest lists their tables,
// and that order is what puts a user in place before the shortcuts it owns.
func TestRestoreRejectsOutOfOrderTableDeclaration(t *testing.T) {
	ctx := context.Background()
	raw := tamperedBackup(ctx, t, func(manifest *backup.Manifest) {
		manifest.Tables = []string{
			backup.TableUser, backup.TableUserSetting, backup.TableWorkspaceSetting,
			backup.TableCollection, backup.TableShortcut, backup.TableActivity,
		}
	})

	target, err := restoreTampered(ctx, t, raw)
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, "out of order")
	requireUntouched(ctx, t, target)
}

func TestRestoreRejectsManifestDeclaringNoTables(t *testing.T) {
	ctx := context.Background()
	raw := tamperedBackup(ctx, t, func(manifest *backup.Manifest) {
		manifest.Tables = nil
	})

	target, err := restoreTampered(ctx, t, raw)
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	requireUntouched(ctx, t, target)
}

// TestRestoreRejectsUndeclaredRecord covers the manifest lying by omission: the
// file carries rows for a table it does not admit to containing, so it is not
// the file it describes itself as.
func TestRestoreRejectsUndeclaredRecord(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)

	// An export that excludes activity, with an activity record smuggled back in.
	var buf bytes.Buffer
	require.NoError(t, backup.Export(ctx, source, testProfile(), backup.ExportOptions{IncludeActivities: false}, &buf))
	manifest, records := splitBackup(t, buf.Bytes())

	_, withActivity := splitBackup(t, exportAll(ctx, t, source))
	for _, record := range withActivity {
		parsed := &backup.Record{}
		require.NoError(t, json.Unmarshal(record, parsed))
		if parsed.Table == backup.TableActivity {
			records = append(records, record)
		}
	}
	require.NotEmpty(t, records)

	target, err := restoreTampered(ctx, t, joinBackup(t, manifest, records))
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, backup.TableActivity)
	requireUntouched(ctx, t, target)
}

// TestRestoreRejectsRecordsOutOfOrder covers the file disagreeing with the order
// its own manifest declares. Replaying records in file order is what puts a row
// in place before whatever references it, so a file that shuffles them is not
// one we can replay.
func TestRestoreRejectsRecordsOutOfOrder(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)

	manifest, records := splitBackup(t, exportAll(ctx, t, source))

	// Regroup so the collection records come ahead of the shortcuts they
	// reference, leaving everything else where it was.
	byTable := map[string][][]byte{}
	for _, record := range records {
		parsed := &backup.Record{}
		require.NoError(t, json.Unmarshal(record, parsed))
		byTable[parsed.Table] = append(byTable[parsed.Table], record)
	}
	require.NotEmpty(t, byTable[backup.TableCollection])
	require.NotEmpty(t, byTable[backup.TableShortcut])

	var shuffled [][]byte
	for _, table := range []string{
		backup.TableUser, backup.TableUserSetting, backup.TableWorkspaceSetting,
		backup.TableCollection, backup.TableShortcut, backup.TableActivity,
	} {
		shuffled = append(shuffled, byTable[table]...)
	}

	target, err := restoreTampered(ctx, t, joinBackup(t, manifest, shuffled))
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	require.ErrorContains(t, err, "out of order")
	requireUntouched(ctx, t, target)
}

// TestRestoreRejectsTruncatedFile covers the half-finished upload: valid as far
// as it goes, and cut off mid-record.
func TestRestoreRejectsTruncatedFile(t *testing.T) {
	ctx := context.Background()
	source := teststore.NewTestingStore(ctx, t)
	seed(ctx, t, source)

	plain := gunzipForTest(t, exportAll(ctx, t, source))
	truncated := plain[:len(plain)-20]

	target, err := restoreTampered(ctx, t, gzipForTest(t, truncated))
	require.ErrorIs(t, err, backup.ErrMalformedBackup)
	requireUntouched(ctx, t, target)
}

// requireUntouched checks the promise every validation failure has to keep: the
// target still holds exactly the admin it held before the restore was attempted.
func requireUntouched(ctx context.Context, t *testing.T, target *store.Store) {
	t.Helper()

	users, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, "installer@slash.com", users[0].Email, "a rejected backup must leave the target exactly as it was")

	shortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Empty(t, shortcuts)
}
