package postgres

import (
	"context"
	"database/sql"
	"strings"

	"github.com/lib/pq"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

type restoreTx struct {
	tx *sql.Tx
}

func (d *DB) BeginRestore(ctx context.Context) (store.RestoreTx, error) {
	// A restore reads whether the target is empty and then deletes what it found.
	// Under the default READ COMMITTED, the DELETE would see rows committed after
	// that read and destroy them without anyone being told. SERIALIZABLE pins the
	// transaction to one snapshot, so a row written in that window is neither
	// visible to the DELETE nor lost by it, and any interleaving that genuinely
	// could not have happened in some serial order fails the transaction outright.
	tx, err := d.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	return &restoreTx{tx: tx}, nil
}

func (r *restoreTx) CountContent(ctx context.Context) (store.WorkspaceContent, error) {
	var content store.WorkspaceContent
	err := r.tx.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM shortcut),
			(SELECT COUNT(*) FROM collection),
			(SELECT COUNT(*) FROM "user")
	`).Scan(&content.Shortcuts, &content.Collections, &content.Members)
	return content, err
}

// deleteOrder lists tables children-first, which this schema requires:
// user_setting, shortcut and collection all carry a foreign key to "user".
var deleteOrder = []string{"activity", "collection", "shortcut", "user_setting", "workspace_setting", `"user"`}

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
		INSERT INTO "user" (id, created_ts, updated_ts, row_status, email, nickname, password_hash, role)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
		"INSERT INTO user_setting (user_id, key, value) VALUES ($1, $2, $3)",
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
		"INSERT INTO workspace_setting (key, value) VALUES ($1, $2)",
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
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	// Mirrors CreateCollection: this driver stores shortcut_ids as a real int[],
	// where SQLite stores a comma-joined string.
	_, err := r.tx.ExecContext(ctx, stmt,
		collection.Id, collection.CreatorId, collection.CreatedTs, collection.UpdatedTs,
		collection.Name, collection.Title, collection.Description, pq.Array(collection.ShortcutIds),
		collection.Visibility.String(),
	)
	return err
}

func (r *restoreTx) InsertActivity(ctx context.Context, activity *store.Activity) error {
	stmt := `
		INSERT INTO activity (id, creator_id, created_ts, type, level, payload)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.tx.ExecContext(ctx, stmt,
		activity.ID, activity.CreatorID, activity.CreatedTs,
		activity.Type.String(), activity.Level.String(), activity.Payload,
	)
	return err
}

// sequences maps each SERIAL column to the table it numbers. Inserting explicit
// IDs bypasses the sequence, so without this the next ordinary insert would
// reuse an ID a restored row already holds.
var sequences = map[string]string{
	`"user"`:     "user_id_seq",
	"shortcut":   "shortcut_id_seq",
	"collection": "collection_id_seq",
	"activity":   "activity_id_seq",
}

func (r *restoreTx) Finalize(ctx context.Context) error {
	for table, sequence := range sequences {
		// COALESCE handles an empty table: setval cannot take 0 with is_called
		// true, so fall back to 1 with is_called false, meaning "next value is 1".
		stmt := `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ` + table + `), 1), (SELECT MAX(id) IS NOT NULL FROM ` + table + `))`
		if _, err := r.tx.ExecContext(ctx, stmt, sequence); err != nil {
			return err
		}
	}
	return nil
}

func (r *restoreTx) Commit() error {
	return r.tx.Commit()
}

func (r *restoreTx) Rollback() error {
	return r.tx.Rollback()
}
