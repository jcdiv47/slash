package store

import (
	"context"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
)

// RestoreTx is a single transaction that replaces the entire contents of a
// Workspace with the contents of a Backup.
//
// It exists alongside the ordinary Create* methods rather than reusing them
// because a restore must preserve IDs and timestamps verbatim — Create* assigns
// fresh ones, which would break the creator_id and collection.shortcut_ids
// references a Backup carries. See
// docs/adr/0003-logical-domain-level-backups.md.
//
// Rows are inserted one at a time so a restore streams, and everything happens
// inside one transaction so a failure leaves the target exactly as it was. The
// caller must call either Commit or Rollback.
type RestoreTx interface {
	// CountContent reports how much the target Workspace already holds, in the
	// terms ADR 0004 uses to define an Empty Instance.
	//
	// It lives on the transaction rather than on Store because the answer is only
	// worth anything if nothing can change it before DeleteAll runs. Read outside
	// the transaction, a Workspace found empty could take a write in the moment
	// between the answer and the deletion, and that write would be destroyed
	// without anyone being told. See BeginRestore for how each driver closes
	// that window.
	CountContent(ctx context.Context) (WorkspaceContent, error)

	// DeleteAll removes every row a Backup covers, in an order that respects
	// foreign keys.
	DeleteAll(ctx context.Context) error

	InsertUser(ctx context.Context, user *User) error
	InsertUserSetting(ctx context.Context, userSetting *storepb.UserSetting) error
	InsertWorkspaceSetting(ctx context.Context, workspaceSetting *storepb.WorkspaceSetting) error
	InsertShortcut(ctx context.Context, shortcut *storepb.Shortcut) error
	InsertCollection(ctx context.Context, collection *storepb.Collection) error
	InsertActivity(ctx context.Context, activity *Activity) error

	// Finalize runs whatever the driver needs after explicit-ID inserts, so that
	// subsequently created rows do not collide with restored ones. On Postgres
	// this advances the SERIAL sequences; on SQLite AUTOINCREMENT maintains
	// itself and this is a no-op.
	Finalize(ctx context.Context) error

	Commit() error
	// Rollback is safe to call after a successful Commit, so it can be deferred.
	Rollback() error
}

// WorkspaceContent is how much a Workspace holds, counted in the three things
// that decide whether it is an Empty Instance. These are row counts rather than
// what the List* methods return: an archived Shortcut is still a Shortcut a
// restore would destroy.
type WorkspaceContent struct {
	Shortcuts   int
	Collections int
	Members     int
}

// IsEmptyInstance reports whether a Restore may replace this Workspace. One
// Member is allowed because a restore necessarily happens on a fresh install,
// where an admin had to be created in order to sign in and start it. See
// docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md.
func (c WorkspaceContent) IsEmptyInstance() bool {
	return c.Shortcuts == 0 && c.Collections == 0 && c.Members <= 1
}

// BeginRestore starts a restore transaction.
//
// The transaction excludes concurrent writers for its whole length, not just
// while it writes, so that CountContent's answer is still true when DeleteAll
// acts on it. Each driver achieves that differently — see the two
// implementations — but the guarantee both owe this interface is the same: no
// write may commit between the emptiness decision and the deletion it licenses.
func (s *Store) BeginRestore(ctx context.Context) (RestoreTx, error) {
	return s.driver.BeginRestore(ctx)
}

// InvalidateCaches drops every cached row. A restore replaces the rows the
// caches were built from, so they are all stale afterwards.
func (s *Store) InvalidateCaches() {
	s.workspaceSettingCache.Clear()
	s.userCache.Clear()
	s.userSettingCache.Clear()
	s.shortcutCache.Clear()
}
