// Package backup exports and restores a Workspace as a single portable file.
//
// The file is gzipped NDJSON: a Manifest on the first line, then one Record per
// row. Records hold serialised domain models rather than raw column values, so a
// backup taken on SQLite restores onto Postgres and vice versa. See
// docs/adr/0003-logical-domain-level-backups.md.
package backup

import (
	"encoding/json"
	"strings"

	"github.com/pkg/errors"
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

// ErrMalformedBackup marks a file that is not the Backup it claims to be:
// incomplete, self-contradictory, or carrying rows its Manifest does not
// declare. It is an operator handing over the wrong or a truncated file, not a
// fault in this instance, so callers report it as such.
var ErrMalformedBackup = errors.New("this file is not a complete backup")

// malformedBackup says why a file cannot be trusted as a Backup, in a sentence
// an operator can act on, while staying matchable as ErrMalformedBackup.
func malformedBackup(format string, args ...any) error {
	return errors.Wrapf(ErrMalformedBackup, format, args...)
}

// optionalTable is the one table a Manifest may leave out. Everything else is
// required, because an export that omitted it would have produced a Backup that
// silently loses part of the Workspace. See ADR 0003.
const optionalTable = TableActivity

// declares reports whether the Backup claims to carry rows for a table. A
// validated Manifest is exhaustive, so a record for anything it does not declare
// means the file and its description disagree.
func (m *Manifest) declares(table string) bool {
	for _, declared := range m.Tables {
		if declared == table {
			return true
		}
	}
	return false
}

// validate checks that the Manifest describes a Backup this instance can trust:
// every table declaration is one we know, declared once, in the order records
// are written, and no required table is missing.
//
// The order matters beyond tidiness. A restore replays records in file order so
// that a row lands after whatever it references, and the Manifest is the file's
// claim about that order — so a Manifest listing tables in some other order
// describes a file we have no reason to believe replays safely.
func (m *Manifest) validate() error {
	if len(m.Tables) == 0 {
		return malformedBackup("its manifest declares no tables")
	}

	// Walking the declarations against the canonical order catches the unknown,
	// the repeated and the misordered in one pass: each must sit strictly later
	// in that order than the one before it.
	minPosition := 0
	for _, table := range m.Tables {
		position := indexOfTable(table)
		if position < 0 {
			return malformedBackup("its manifest declares a table this version of Slash does not know: %q", table)
		}
		if position < minPosition {
			if m.declaredTwice(table) {
				return malformedBackup("its manifest declares table %q more than once", table)
			}
			return malformedBackup("its manifest declares table %q out of order; tables must be declared as %s", table, strings.Join(orderedTables, ", "))
		}
		minPosition = position + 1
	}

	for _, table := range orderedTables {
		if table == optionalTable || m.declares(table) {
			continue
		}
		return malformedBackup("its manifest omits the required table %q", table)
	}
	return nil
}

func (m *Manifest) declaredTwice(table string) bool {
	seen := 0
	for _, declared := range m.Tables {
		if declared == table {
			seen++
		}
	}
	return seen > 1
}

func indexOfTable(table string) int {
	for i, known := range orderedTables {
		if known == table {
			return i
		}
	}
	return -1
}
