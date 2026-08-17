package backup

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/yourselfhosted/slash/server/common"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/store"
)

// ExportOptions controls what an export includes.
type ExportOptions struct {
	// IncludeActivities writes the activity table. It is the only optional
	// table, and it is the bulky one: activity grows on every Shortcut view.
	// Note that activities carry the viewer's IP address.
	IncludeActivities bool
}

// Export writes a complete backup of the Workspace to w.
//
// Every table is read from one snapshot, so a Workspace that changes while the
// export runs still yields a file representing a single point in time. Rows are
// streamed table by table, and activity — the table that grows without bound —
// a row at a time, so memory stays flat however large the Workspace has grown.
// The caller is responsible for closing w.
//
// The resulting file contains password hashes, the Workspace secret_session, IdP
// client secrets, and access tokens, all unredacted. See
// docs/adr/0005-backups-contain-secrets-verbatim.md.
func Export(ctx context.Context, s *store.Store, p *profile.Profile, opts ExportOptions, w io.Writer) error {
	schemaVersion, err := s.GetCurrentSchemaVersion()
	if err != nil {
		return errors.Wrap(err, "failed to get current schema version")
	}

	tx, err := s.BeginExport(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to open export snapshot")
	}
	// An export writes nothing, so there is never anything to commit; this only
	// releases the snapshot and its connection.
	defer func() { _ = tx.Rollback() }()

	// Copy rather than reslice: this ends up in the Manifest, and must not share
	// a backing array with the package-level order.
	tables := make([]string, 0, len(orderedTables))
	for _, table := range orderedTables {
		if table == TableActivity && !opts.IncludeActivities {
			continue
		}
		tables = append(tables, table)
	}

	gzipWriter := gzip.NewWriter(w)
	encoder := json.NewEncoder(gzipWriter)

	manifest := &Manifest{
		Format:        FormatVersion,
		SlashVersion:  common.GetCurrentVersion(p.Mode),
		SchemaVersion: schemaVersion,
		CreatedTs:     time.Now().Unix(),
		Tables:        tables,
	}
	if err := encoder.Encode(manifest); err != nil {
		return errors.Wrap(err, "failed to write manifest")
	}

	for _, table := range tables {
		if err := exportTable(ctx, tx, table, encoder); err != nil {
			return errors.Wrapf(err, "failed to export table %q", table)
		}
	}

	// gzip buffers, so a failure to close is a failure to write the backup.
	if err := gzipWriter.Close(); err != nil {
		return errors.Wrap(err, "failed to flush backup")
	}
	return nil
}

func exportTable(ctx context.Context, tx store.ExportTx, table string, encoder *json.Encoder) error {
	write := func(data []byte) error {
		return encoder.Encode(&Record{Table: table, Data: data})
	}

	switch table {
	case TableUser:
		users, err := tx.ListUsers(ctx)
		if err != nil {
			return err
		}
		for _, user := range users {
			data, err := json.Marshal(user)
			if err != nil {
				return err
			}
			if err := write(data); err != nil {
				return err
			}
		}
	case TableUserSetting:
		userSettings, err := tx.ListUserSettings(ctx)
		if err != nil {
			return err
		}
		return writeMessages(userSettings, write)
	case TableWorkspaceSetting:
		workspaceSettings, err := tx.ListWorkspaceSettings(ctx)
		if err != nil {
			return err
		}
		return writeMessages(workspaceSettings, write)
	case TableShortcut:
		shortcuts, err := tx.ListShortcuts(ctx)
		if err != nil {
			return err
		}
		return writeMessages(shortcuts, write)
	case TableCollection:
		collections, err := tx.ListCollections(ctx)
		if err != nil {
			return err
		}
		return writeMessages(collections, write)
	case TableActivity:
		// Streamed rather than listed: activity grows on every Shortcut view, so
		// it is the one table a Workspace can outgrow memory with.
		return tx.ScanActivities(ctx, func(activity *store.Activity) error {
			data, err := json.Marshal(activity)
			if err != nil {
				return err
			}
			return write(data)
		})
	default:
		return errors.Errorf("unknown table %q", table)
	}
	return nil
}

func writeMessages[T proto.Message](messages []T, write func([]byte) error) error {
	for _, message := range messages {
		data, err := marshalMessage(message)
		if err != nil {
			return err
		}
		if err := write(data); err != nil {
			return err
		}
	}
	return nil
}

// marshalMessage renders a proto message as compact JSON.
//
// protojson deliberately injects random whitespace to discourage byte-for-byte
// comparison of its output, which would make backups of identical data differ
// and is simply noise inside an NDJSON line. json.Compact strips it back out.
func marshalMessage(message proto.Message) ([]byte, error) {
	data, err := protojson.Marshal(message)
	if err != nil {
		return nil, err
	}
	var compacted bytes.Buffer
	if err := json.Compact(&compacted, data); err != nil {
		return nil, err
	}
	return compacted.Bytes(), nil
}
