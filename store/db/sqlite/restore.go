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
}

func (d *DB) BeginRestore(ctx context.Context) (store.RestoreTx, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	return &restoreTx{tx: tx}, nil
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
	return r.tx.Commit()
}

func (r *restoreTx) Rollback() error {
	return r.tx.Rollback()
}
