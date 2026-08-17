package backup_test

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/yourselfhosted/slash/server/common"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
	"github.com/yourselfhosted/slash/store/db"
)

// crossDriverDSNEnv names the environment variable holding a Postgres DSN. The
// cross-driver tests are skipped when it is unset, so the default `go test ./...`
// run stays dependency-free.
const crossDriverDSNEnv = "POSTGRES_DSN"

func newStore(ctx context.Context, t *testing.T, driver, dsn string) *store.Store {
	t.Helper()
	p := &profile.Profile{
		Mode:    "prod",
		Driver:  driver,
		DSN:     dsn,
		Data:    t.TempDir(),
		Version: common.GetCurrentVersion("prod"),
	}
	dbDriver, err := db.NewDBDriver(p)
	require.NoError(t, err)
	t.Cleanup(func() { _ = dbDriver.Close() })

	if driver == "postgres" {
		_, err := dbDriver.GetDB().ExecContext(ctx, `
			DROP TABLE IF EXISTS migration_history CASCADE;
			DROP TABLE IF EXISTS workspace_setting CASCADE;
			DROP TABLE IF EXISTS "user" CASCADE;
			DROP TABLE IF EXISTS user_setting CASCADE;
			DROP TABLE IF EXISTS shortcut CASCADE;
			DROP TABLE IF EXISTS activity CASCADE;
			DROP TABLE IF EXISTS collection CASCADE;`)
		require.NoError(t, err)
	}

	s := store.New(dbDriver, p)
	require.NoError(t, s.Migrate(ctx))
	return s
}

func newSQLiteStore(ctx context.Context, t *testing.T) *store.Store {
	t.Helper()
	return newStore(ctx, t, "sqlite", fmt.Sprintf("%s/cross.db", t.TempDir()))
}

func newPostgresStore(ctx context.Context, t *testing.T) *store.Store {
	t.Helper()
	dsn := os.Getenv(crossDriverDSNEnv)
	if dsn == "" {
		t.Skipf("set %s to run cross-driver tests", crossDriverDSNEnv)
	}
	return newStore(ctx, t, "postgres", dsn)
}

// assertRestoredFaithfully checks the properties that must hold whichever
// direction a backup crossed.
func assertRestoredFaithfully(ctx context.Context, t *testing.T, source, target *store.Store) {
	t.Helper()

	sourceShortcuts, err := source.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	targetShortcuts, err := target.ListShortcuts(ctx, &store.FindShortcut{})
	require.NoError(t, err)
	require.Len(t, targetShortcuts, len(sourceShortcuts))
	require.Equal(t, sourceShortcuts[0].Id, targetShortcuts[0].Id)
	require.Equal(t, sourceShortcuts[0].Name, targetShortcuts[0].Name)
	// Tags are stored space-joined in one column; a round trip must not mangle them.
	require.Equal(t, sourceShortcuts[0].Tags, targetShortcuts[0].Tags)

	sourceCollections, err := source.ListCollections(ctx, &store.FindCollection{})
	require.NoError(t, err)
	targetCollections, err := target.ListCollections(ctx, &store.FindCollection{})
	require.NoError(t, err)
	require.Len(t, targetCollections, len(sourceCollections))
	// The whole reason the format serialises domain models: SQLite stores this as
	// a comma-joined string and Postgres as a real int[].
	require.Equal(t, sourceCollections[0].ShortcutIds, targetCollections[0].ShortcutIds)

	sourceUsers, err := source.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	targetUsers, err := target.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Len(t, targetUsers, len(sourceUsers))
	require.Equal(t, sourceUsers[0].ID, targetUsers[0].ID)
	require.Equal(t, sourceUsers[0].PasswordHash, targetUsers[0].PasswordHash)
	require.Equal(t, sourceUsers[0].CreatedTs, targetUsers[0].CreatedTs)
}

func TestCrossDriverSQLiteToPostgres(t *testing.T) {
	ctx := context.Background()
	source := newSQLiteStore(ctx, t)
	target := newPostgresStore(ctx, t)

	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(raw)))
	assertRestoredFaithfully(ctx, t, source, target)
}

func TestCrossDriverPostgresToSQLite(t *testing.T) {
	ctx := context.Background()
	source := newPostgresStore(ctx, t)
	target := newSQLiteStore(ctx, t)

	seed(ctx, t, source)
	raw := exportAll(ctx, t, source)

	require.NoError(t, backup.Restore(ctx, target, bytes.NewReader(raw)))
	assertRestoredFaithfully(ctx, t, source, target)
}
