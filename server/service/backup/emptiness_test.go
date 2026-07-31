package backup_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

// eachDriver runs a test body against both drivers, so a guarantee that rests on
// transaction semantics is checked where those semantics actually differ.
// Postgres is skipped unless a DSN is configured.
func eachDriver(t *testing.T, body func(ctx context.Context, t *testing.T, driver string, s *store.Store)) {
	t.Helper()

	t.Run("sqlite", func(t *testing.T) {
		ctx := context.Background()
		body(ctx, t, "sqlite", newSQLiteStore(ctx, t))
	})
	t.Run("postgres", func(t *testing.T) {
		ctx := context.Background()
		body(ctx, t, "postgres", newPostgresStore(ctx, t))
	})
}

// installAdmin puts a store in the state a restore is really performed from: a
// fresh install holding the one admin who signed in to start it.
func installAdmin(ctx context.Context, t *testing.T, s *store.Store) *store.User {
	t.Helper()

	user, err := s.CreateUser(ctx, &store.User{
		Email: "installer@slash.com", Nickname: "installer", PasswordHash: "x", Role: store.RoleAdmin,
	})
	require.NoError(t, err)
	return user
}

func TestCountContentSeesTheWholeWorkspace(t *testing.T) {
	eachDriver(t, func(ctx context.Context, t *testing.T, _ string, s *store.Store) {
		seed(ctx, t, s)

		tx, err := s.BeginRestore(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback() }()

		content, err := tx.CountContent(ctx)
		require.NoError(t, err)
		require.Equal(t, store.WorkspaceContent{Shortcuts: 1, Collections: 1, Members: 1}, content)
		require.False(t, content.IsEmptyInstance())
	})
}

func TestEmptyInstanceIsOneAdminAndNothingElse(t *testing.T) {
	eachDriver(t, func(ctx context.Context, t *testing.T, _ string, s *store.Store) {
		installAdmin(ctx, t, s)

		tx, err := s.BeginRestore(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback() }()

		content, err := tx.CountContent(ctx)
		require.NoError(t, err)
		require.Equal(t, store.WorkspaceContent{Members: 1}, content)
		require.True(t, content.IsEmptyInstance())
	})
}

// TestConcurrentWriteCannotBeSilentlyDeleted drives a restore transaction by
// hand so that the dangerous interleaving happens on purpose rather than by
// luck: the emptiness decision is taken, and only then does another connection
// write.
//
// The row that connection creates must still be there afterwards. It was never
// covered by the decision to delete, so nothing may destroy it — and neither
// driver may reach that outcome by luck, so each one's mechanism is pinned here
// too.
func TestConcurrentWriteCannotBeSilentlyDeleted(t *testing.T) {
	eachDriver(t, func(ctx context.Context, t *testing.T, driver string, s *store.Store) {
		installer := installAdmin(ctx, t, s)

		tx, err := s.BeginRestore(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback() }()

		content, err := tx.CountContent(ctx)
		require.NoError(t, err)
		require.True(t, content.IsEmptyInstance(), "the restore has now decided this workspace is empty")

		// Exactly the window that used to be unprotected: after the decision,
		// before the deletion it authorises.
		written := make(chan error, 1)
		go func() {
			_, err := s.CreateShortcut(ctx, &storepb.Shortcut{
				CreatorId:  installer.ID,
				Name:       "raced",
				Link:       "https://example.com",
				Visibility: storepb.Visibility_WORKSPACE,
			})
			written <- err
		}()
		// Long enough for that write to reach the database — or to be held off by
		// the restore's lock, which is why this cannot simply wait for it.
		time.Sleep(500 * time.Millisecond)

		restored := tx.DeleteAll(ctx)
		if restored == nil {
			restored = tx.Finalize(ctx)
		}
		if restored == nil {
			restored = tx.Commit()
		}
		// Releases the lock the concurrent writer may still be queued behind.
		_ = tx.Rollback()

		require.NoError(t, <-written, "a write racing a restore must not be rejected")

		switch driver {
		case "sqlite":
			// BEGIN IMMEDIATE held the write lock for the whole transaction, so the
			// writer waited its turn and its row landed on top of the restore.
			require.NoError(t, restored, "the writer waits, so the restore goes through cleanly")
		case "postgres":
			// The writer did not wait. Its row is invisible to this transaction's
			// snapshot, so rather than delete the admin it references behind its
			// back, the restore fails and rolls the whole thing back.
			require.Error(t, restored, "the restore must fail rather than delete around a row it cannot see")
		}

		shortcuts, err := s.ListShortcuts(ctx, &store.FindShortcut{})
		require.NoError(t, err)
		require.Len(t, shortcuts, 1, "the concurrent write must survive, restore or no restore")

		if restored != nil {
			// A failed restore changes nothing at all, including the admin that
			// DeleteAll had already removed.
			users, err := s.ListUsers(ctx, &store.FindUser{})
			require.NoError(t, err)
			require.Len(t, users, 1)
			require.Equal(t, installer.ID, users[0].ID)
		}
	})
}
