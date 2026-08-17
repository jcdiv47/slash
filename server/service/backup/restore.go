package backup

import (
	"bufio"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

// maxLineBytes caps a single NDJSON line. Records are individual rows, so this
// is generous; it exists so a corrupt file cannot exhaust memory.
const maxLineBytes = 8 * 1024 * 1024

// ErrNotEmpty is returned when the target Workspace already holds content. A
// restore replaces everything, so it refuses to run anywhere it would destroy
// data the operator may not have meant to lose. See
// docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md.
var ErrNotEmpty = errors.New("restore requires an empty instance: no shortcuts, no collections, and at most one member")

// VersionMismatchError is returned when a backup was produced by a different
// schema version than the running binary.
type VersionMismatchError struct {
	BackupVersion  string
	RunningVersion string
}

func (e *VersionMismatchError) Error() string {
	return "this backup was made by Slash schema version " + e.BackupVersion +
		", but this instance runs " + e.RunningVersion +
		". Restore it with that version of Slash first, then upgrade."
}

// Restore replaces the entire contents of the Workspace with the Backup read
// from r.
//
// Everything happens in one transaction, so a failure leaves the instance
// exactly as it was. On success the caller must restart the instance: the
// Workspace secret_session has been replaced and the server caches it at
// startup.
func Restore(ctx context.Context, s *store.Store, r io.Reader) error {
	gzipReader, err := gzip.NewReader(r)
	if err != nil {
		return malformedBackup("it is not a valid gzip file: %v", err)
	}
	defer gzipReader.Close()

	scanner := bufio.NewScanner(gzipReader)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLineBytes)

	manifest, err := readManifest(scanner)
	if err != nil {
		return err
	}
	schemaVersion, err := s.GetCurrentSchemaVersion()
	if err != nil {
		return errors.Wrap(err, "failed to get current schema version")
	}
	if manifest.SchemaVersion != schemaVersion {
		return &VersionMismatchError{BackupVersion: manifest.SchemaVersion, RunningVersion: schemaVersion}
	}

	restoreTx, err := s.BeginRestore(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to begin restore")
	}
	// Safe after a successful commit, and the only thing that runs on any error
	// path below.
	defer func() { _ = restoreTx.Rollback() }()

	// Inside the transaction, so that the emptiness this refuses to proceed
	// without is still true by the time DeleteAll acts on it.
	if err := requireEmptyInstance(ctx, restoreTx); err != nil {
		return err
	}

	if err := restoreTx.DeleteAll(ctx); err != nil {
		return errors.Wrap(err, "failed to clear the workspace")
	}

	// The position in orderedTables of the last record seen. Records replay in
	// file order, which is what puts a row in place before anything referencing
	// it, so that order has to hold in the file as well as in the manifest.
	lastPosition := 0
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		record := &Record{}
		if err := json.Unmarshal(line, record); err != nil {
			return malformedBackup("one of its records is not readable: %v", err)
		}
		// The manifest is the file's account of itself; a record for a table it
		// does not declare means the two disagree, and we cannot tell which is
		// wrong.
		if !manifest.declares(record.Table) {
			return malformedBackup("it carries a %q record its manifest does not declare", record.Table)
		}
		position := indexOfTable(record.Table)
		if position < lastPosition {
			return malformedBackup("it carries a %q record out of order; records must appear in the order %s", record.Table, strings.Join(orderedTables, ", "))
		}
		lastPosition = position

		if err := insertRecord(ctx, restoreTx, record); err != nil {
			return errors.Wrapf(err, "failed to restore a %q record", record.Table)
		}
	}
	// A read that fails part-way through is a file that was cut short — a
	// half-finished upload or a truncated copy — not a fault in this instance.
	if err := scanner.Err(); err != nil {
		return malformedBackup("it stops part-way through: %v", err)
	}

	if err := restoreTx.Finalize(ctx); err != nil {
		return errors.Wrap(err, "failed to finalize restore")
	}
	if err := restoreTx.Commit(); err != nil {
		return errors.Wrap(err, "failed to commit restore")
	}

	// The caches were built from rows that no longer exist.
	s.InvalidateCaches()
	return nil
}

func readManifest(scanner *bufio.Scanner) (*Manifest, error) {
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return nil, malformedBackup("it stops before its manifest: %v", err)
		}
		return nil, malformedBackup("it is empty")
	}
	manifest := &Manifest{}
	if err := json.Unmarshal(scanner.Bytes(), manifest); err != nil {
		return nil, malformedBackup("its manifest is not readable: %v", err)
	}
	if manifest.Format != FormatVersion {
		return nil, malformedBackup("it is in backup format %d, and this version of Slash reads format %d", manifest.Format, FormatVersion)
	}
	if err := manifest.validate(); err != nil {
		return nil, err
	}
	return manifest, nil
}

func insertRecord(ctx context.Context, tx store.RestoreTx, record *Record) error {
	switch record.Table {
	case TableUser:
		user := &store.User{}
		if err := json.Unmarshal(record.Data, user); err != nil {
			return err
		}
		return tx.InsertUser(ctx, user)
	case TableUserSetting:
		userSetting := &storepb.UserSetting{}
		if err := protojson.Unmarshal(record.Data, userSetting); err != nil {
			return err
		}
		return tx.InsertUserSetting(ctx, userSetting)
	case TableWorkspaceSetting:
		workspaceSetting := &storepb.WorkspaceSetting{}
		if err := protojson.Unmarshal(record.Data, workspaceSetting); err != nil {
			return err
		}
		return tx.InsertWorkspaceSetting(ctx, workspaceSetting)
	case TableShortcut:
		shortcut := &storepb.Shortcut{}
		if err := protojson.Unmarshal(record.Data, shortcut); err != nil {
			return err
		}
		return tx.InsertShortcut(ctx, shortcut)
	case TableCollection:
		collection := &storepb.Collection{}
		if err := protojson.Unmarshal(record.Data, collection); err != nil {
			return err
		}
		return tx.InsertCollection(ctx, collection)
	case TableActivity:
		activity := &store.Activity{}
		if err := json.Unmarshal(record.Data, activity); err != nil {
			return err
		}
		return tx.InsertActivity(ctx, activity)
	default:
		return errors.Errorf("unknown table %q", record.Table)
	}
}

// requireEmptyInstance enforces the precondition from ADR 0004, reading the
// target through the restore transaction so that no write can land between the
// answer and the DeleteAll it authorises.
func requireEmptyInstance(ctx context.Context, tx store.RestoreTx) error {
	content, err := tx.CountContent(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to inspect the target workspace")
	}
	if !content.IsEmptyInstance() {
		return ErrNotEmpty
	}
	return nil
}
