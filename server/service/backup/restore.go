package backup

import (
	"bufio"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/server/profile"
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
func Restore(ctx context.Context, s *store.Store, p *profile.Profile, r io.Reader) error {
	if err := requireEmptyInstance(ctx, s); err != nil {
		return err
	}

	gzipReader, err := gzip.NewReader(r)
	if err != nil {
		return errors.Wrap(err, "backup is not a valid gzip file")
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

	if err := restoreTx.DeleteAll(ctx); err != nil {
		return errors.Wrap(err, "failed to clear the workspace")
	}

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		record := &Record{}
		if err := json.Unmarshal(line, record); err != nil {
			return errors.Wrap(err, "failed to parse backup record")
		}
		if err := insertRecord(ctx, restoreTx, record); err != nil {
			return errors.Wrapf(err, "failed to restore a %q record", record.Table)
		}
	}
	if err := scanner.Err(); err != nil {
		return errors.Wrap(err, "failed to read backup")
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
			return nil, errors.Wrap(err, "failed to read backup")
		}
		return nil, errors.New("backup is empty")
	}
	manifest := &Manifest{}
	if err := json.Unmarshal(scanner.Bytes(), manifest); err != nil {
		return nil, errors.Wrap(err, "backup has no readable manifest")
	}
	if manifest.Format != FormatVersion {
		return nil, errors.Errorf("unsupported backup format %d, this version of Slash reads format %d", manifest.Format, FormatVersion)
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

// requireEmptyInstance enforces the precondition from ADR 0004. One user is
// allowed because restoring necessarily happens from a fresh install, where an
// admin had to be created in order to sign in and start the restore.
func requireEmptyInstance(ctx context.Context, s *store.Store) error {
	shortcuts, err := s.ListShortcuts(ctx, &store.FindShortcut{})
	if err != nil {
		return errors.Wrap(err, "failed to list shortcuts")
	}
	collections, err := s.ListCollections(ctx, &store.FindCollection{})
	if err != nil {
		return errors.Wrap(err, "failed to list collections")
	}
	users, err := s.ListUsers(ctx, &store.FindUser{})
	if err != nil {
		return errors.Wrap(err, "failed to list users")
	}
	if len(shortcuts) > 0 || len(collections) > 0 || len(users) > 1 {
		return ErrNotEmpty
	}
	return nil
}
