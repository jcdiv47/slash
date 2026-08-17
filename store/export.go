package store

import (
	"context"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
)

// ExportTx is a read-only snapshot of the whole Workspace, held open for the
// duration of an Export.
//
// It exists alongside the ordinary List* methods for two reasons. First, every
// table must be read from one point in time: reading them one connection at a
// time lets a Workspace that changes mid-export produce a Backup whose activity
// references a Shortcut the same file does not contain. Second, the List*
// methods materialise whole tables, which activity — the one table that grows
// without bound — cannot afford; ScanActivities streams instead. See
// docs/adr/0003-logical-domain-level-backups.md.
//
// The snapshot is pinned when the transaction begins, not at the first read, so
// a write racing the export is either wholly in the Backup or wholly absent.
// Reads bypass the Store caches, which is what an export wants: the caches hold
// domain objects assembled for serving, not the rows as stored.
//
// The caller must call Rollback: an export writes nothing and so has nothing to
// commit, but the transaction holds a connection — and, on SQLite, blocks WAL
// checkpointing — until it is released.
type ExportTx interface {
	ListUsers(ctx context.Context) ([]*User, error)
	ListUserSettings(ctx context.Context) ([]*storepb.UserSetting, error)
	ListWorkspaceSettings(ctx context.Context) ([]*storepb.WorkspaceSetting, error)
	ListShortcuts(ctx context.Context) ([]*storepb.Shortcut, error)
	ListCollections(ctx context.Context) ([]*storepb.Collection, error)

	// ScanActivities calls fn once per activity row, in ID order, without
	// holding more than one row at a time. An error from fn stops the scan and
	// is returned unwrapped, so callers can match on their own sentinel.
	ScanActivities(ctx context.Context, fn func(*Activity) error) error

	// Rollback ends the snapshot and releases its connection. There is nothing
	// to commit, so this is the only way an export finishes, successfully or
	// not.
	Rollback() error
}

// BeginExport opens a consistent read-only snapshot of the Workspace.
func (s *Store) BeginExport(ctx context.Context) (ExportTx, error) {
	return s.driver.BeginExport(ctx)
}
