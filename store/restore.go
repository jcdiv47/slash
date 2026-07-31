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

// BeginRestore starts a restore transaction.
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
