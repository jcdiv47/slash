package postgres

import (
	"context"
	"database/sql"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

type exportTx struct {
	tx *sql.Tx
}

func (d *DB) BeginExport(ctx context.Context) (store.ExportTx, error) {
	// READ COMMITTED, the default, takes a fresh snapshot per statement, which
	// would let an export read half of a Workspace before a concurrent write and
	// half after. REPEATABLE READ pins one snapshot for the whole transaction.
	tx, err := d.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}

	// Postgres defers the snapshot to the first statement, so take a read here to
	// pin it at BeginExport rather than at the first table read.
	var count int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM migration_history").Scan(&count); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	return &exportTx{tx: tx}, nil
}

func (e *exportTx) ListUsers(ctx context.Context) ([]*store.User, error) {
	return listUsers(ctx, e.tx, &store.FindUser{})
}

func (e *exportTx) ListUserSettings(ctx context.Context) ([]*storepb.UserSetting, error) {
	return listUserSettings(ctx, e.tx, &store.FindUserSetting{})
}

func (e *exportTx) ListWorkspaceSettings(ctx context.Context) ([]*storepb.WorkspaceSetting, error) {
	return listWorkspaceSettings(ctx, e.tx, &store.FindWorkspaceSetting{})
}

func (e *exportTx) ListShortcuts(ctx context.Context) ([]*storepb.Shortcut, error) {
	return listShortcuts(ctx, e.tx, &store.FindShortcut{})
}

func (e *exportTx) ListCollections(ctx context.Context) ([]*storepb.Collection, error) {
	return listCollections(ctx, e.tx, &store.FindCollection{})
}

func (e *exportTx) ScanActivities(ctx context.Context, fn func(*store.Activity) error) error {
	return scanActivities(ctx, e.tx, fn)
}

func (e *exportTx) Rollback() error {
	return e.tx.Rollback()
}
