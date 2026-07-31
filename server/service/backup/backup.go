// Package backup exports and restores a Workspace as a single portable file.
//
// The file is gzipped NDJSON: a Manifest on the first line, then one Record per
// row. Records hold serialised domain models rather than raw column values, so a
// backup taken on SQLite restores onto Postgres and vice versa. See
// docs/adr/0003-logical-domain-level-backups.md.
package backup

import (
	"encoding/json"
)

// FormatVersion is the version of the backup file format itself, independent of
// the Slash version that produced the file. Bump it only for changes a reader of
// an older file cannot absorb.
const FormatVersion = 1

// Table names as they appear in a Record. These are the logical model names, and
// happen to match the SQL table names today.
const (
	TableUser             = "user"
	TableUserSetting      = "user_setting"
	TableWorkspaceSetting = "workspace_setting"
	TableShortcut         = "shortcut"
	TableCollection       = "collection"
	TableActivity         = "activity"
)

// orderedTables is the order records are written in, chosen so that a restore
// replaying the file in order inserts a row before anything referencing it:
// users own everything, and collections reference shortcut IDs.
var orderedTables = []string{
	TableUser,
	TableUserSetting,
	TableWorkspaceSetting,
	TableShortcut,
	TableCollection,
	TableActivity,
}

// Manifest is the self-describing first line of a backup.
type Manifest struct {
	// Format is the backup file format version. See FormatVersion.
	Format int `json:"format"`
	// SlashVersion is the version of Slash that produced the file.
	SlashVersion string `json:"slashVersion"`
	// SchemaVersion is the database schema version the rows were read from. A
	// restore refuses anything but an exact match. See
	// docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md.
	SchemaVersion string `json:"schemaVersion"`
	// CreatedTs is when the export ran, in Unix seconds.
	CreatedTs int64 `json:"createdTs"`
	// Tables lists which tables this file carries records for, in write order.
	// Activity is omitted when it was excluded from the export.
	Tables []string `json:"tables"`
}

// Record is one row of one table. Data is pre-marshalled because storepb models
// go through protojson while the plain Go models go through encoding/json.
type Record struct {
	Table string          `json:"table"`
	Data  json.RawMessage `json:"data"`
}
