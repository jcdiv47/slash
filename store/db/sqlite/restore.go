package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

type restoreTx struct {
	tx *sql.Tx
	// db is the dedicated handle this transaction runs on, closed when it ends.
	db *sql.DB
}

func (d *DB) BeginRestore(ctx context.Context) (store.RestoreTx, error) {
	// A restore reads whether the target is empty and then deletes what it found,
	// and nothing may commit in between. SQLite's default BEGIN is deferred: it
	// takes the write lock at the first write, leaving exactly that window open.
	// BEGIN IMMEDIATE takes it up front instead, making every other writer wait
	// rather than interleave — but this driver reads the locking mode from the
	// DSN when the connection is opened, and BeginTx cannot ask for it. So the
	// restore gets a handle of its own, opened in immediate mode, which it closes
	// when the transaction ends. Restores are rare and exclusive by nature, so
	// the extra connection costs nothing worth counting.
	db, err := sql.Open("sqlite", d.profile.DSN+connectionParams+"&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	// One connection, so the transaction and its lock cannot end up split across
	// a pool.
	db.SetMaxOpenConns(1)

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &restoreTx{tx: tx, db: db}, nil
}

func (r *restoreTx) CountContent(ctx context.Context) (store.WorkspaceContent, error) {
	var content store.WorkspaceContent
	err := r.tx.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM shortcut),
			(SELECT COUNT(*) FROM collection),
			(SELECT COUNT(*) FROM user)
	`).Scan(&content.Shortcuts, &content.Collections, &content.Members)
	return content, err
}

// deleteOrder lists tables children-first, so the deletes hold even where the
// Postgres schema declares foreign keys.
var deleteOrder = []string{"activity", "collection", "shortcut", "user_setting", "workspace_setting", "user"}

func (r *restoreTx) DeleteAll(ctx context.Context) error {
	for _, table := range deleteOrder {
		if _, err := r.tx.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			return err
		}
	}
	return nil
}

func (r *restoreTx) InsertUser(ctx context.Context, user *store.User) error {
	stmt := `
		INSERT INTO user (id, created_ts, updated_ts, row_status, email, nickname, password_hash, role)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.tx.ExecContext(ctx, stmt,
		user.ID, user.CreatedTs, user.UpdatedTs, user.RowStatus.String(),
		user.Email, user.Nickname, user.PasswordHash, user.Role,
	)
	return err
}

func (r *restoreTx) InsertUserSetting(ctx context.Context, userSetting *storepb.UserSetting) error {
	value, err := marshalUserSettingValue(userSetting)
	if err != nil {
		return err
	}
	_, err = r.tx.ExecContext(ctx,
		"INSERT INTO user_setting (user_id, key, value) VALUES (?, ?, ?)",
		userSetting.UserId, userSetting.Key.String(), value,
	)
	return err
}

func (r *restoreTx) InsertWorkspaceSetting(ctx context.Context, workspaceSetting *storepb.WorkspaceSetting) error {
	value, err := marshalWorkspaceSettingValue(workspaceSetting)
	if err != nil {
		return err
	}
	_, err = r.tx.ExecContext(ctx,
		"INSERT INTO workspace_setting (key, value) VALUES (?, ?)",
		workspaceSetting.Key.String(), value,
	)
	return err
}

func (r *restoreTx) InsertShortcut(ctx context.Context, shortcut *storepb.Shortcut) error {
	ogMetadata := "{}"
	if shortcut.OgMetadata != nil {
		ogMetadataBytes, err := protojson.Marshal(shortcut.OgMetadata)
		if err != nil {
			return err
		}
		ogMetadata = string(ogMetadataBytes)
	}
	stmt := `
		INSERT INTO shortcut (id, creator_id, created_ts, updated_ts, name, link, title, description, visibility, tag, og_metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	// row_status is deliberately absent: it is not part of the domain model, so
	// a backup does not carry it and the column default applies. See ADR 0003.
	_, err := r.tx.ExecContext(ctx, stmt,
		shortcut.Id, shortcut.CreatorId, shortcut.CreatedTs, shortcut.UpdatedTs,
		shortcut.Name, shortcut.Link, shortcut.Title, shortcut.Description,
		shortcut.Visibility.String(), strings.Join(shortcut.Tags, " "), ogMetadata,
	)
	return err
}

func (r *restoreTx) InsertCollection(ctx context.Context, collection *storepb.Collection) error {
	stmt := `
		INSERT INTO collection (id, creator_id, created_ts, updated_ts, name, title, description, shortcut_ids, visibility)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	// Mirrors CreateCollection: this driver stores shortcut_ids as a comma-joined
	// string, where Postgres stores a real int[].
	shortcutIDs := strings.Trim(strings.Join(strings.Fields(fmt.Sprint(collection.ShortcutIds)), ","), "[]")
	_, err := r.tx.ExecContext(ctx, stmt,
		collection.Id, collection.CreatorId, collection.CreatedTs, collection.UpdatedTs,
		collection.Name, collection.Title, collection.Description, shortcutIDs,
		collection.Visibility.String(),
	)
	return err
}

func (r *restoreTx) InsertActivity(ctx context.Context, activity *store.Activity) error {
	stmt := `
		INSERT INTO activity (id, creator_id, created_ts, type, level, payload)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	_, err := r.tx.ExecContext(ctx, stmt,
		activity.ID, activity.CreatorID, activity.CreatedTs,
		activity.Type.String(), activity.Level.String(), activity.Payload,
	)
	return err
}

// Finalize is a no-op: SQLite's AUTOINCREMENT keeps sqlite_sequence at the
// highest ID seen, including IDs supplied explicitly, so the next insert cannot
// collide with a restored row.
func (r *restoreTx) Finalize(_ context.Context) error {
	return nil
}

func (r *restoreTx) Commit() error {
	err := r.tx.Commit()
	// Releases the write lock the whole instance is waiting on, so it happens
	// whether or not the commit worked.
	_ = r.db.Close()
	return err
}

func (r *restoreTx) Rollback() error {
	err := r.tx.Rollback()
	_ = r.db.Close()
	return err
}
