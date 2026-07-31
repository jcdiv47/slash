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
// Rows are streamed table by table, so memory stays flat regardless of how large
// activity has grown. The caller is responsible for closing w.
//
// The resulting file contains password hashes, the Workspace secret_session, IdP
// client secrets, and access tokens, all unredacted. See
// docs/adr/0005-backups-contain-secrets-verbatim.md.
func Export(ctx context.Context, s *store.Store, p *profile.Profile, opts ExportOptions, w io.Writer) error {
	schemaVersion, err := s.GetCurrentSchemaVersion()
	if err != nil {
		return errors.Wrap(err, "failed to get current schema version")
	}

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
		if err := exportTable(ctx, s, table, encoder); err != nil {
			return errors.Wrapf(err, "failed to export table %q", table)
		}
	}

	// gzip buffers, so a failure to close is a failure to write the backup.
	if err := gzipWriter.Close(); err != nil {
		return errors.Wrap(err, "failed to flush backup")
	}
	return nil
}

func exportTable(ctx context.Context, s *store.Store, table string, encoder *json.Encoder) error {
	write := func(data []byte) error {
		return encoder.Encode(&Record{Table: table, Data: data})
	}

	switch table {
	case TableUser:
		users, err := s.ListUsers(ctx, &store.FindUser{})
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
		userSettings, err := s.ListUserSettings(ctx, &store.FindUserSetting{})
		if err != nil {
			return err
		}
		return writeMessages(userSettings, write)
	case TableWorkspaceSetting:
		workspaceSettings, err := s.ListWorkspaceSettings(ctx, &store.FindWorkspaceSetting{})
		if err != nil {
			return err
		}
		return writeMessages(workspaceSettings, write)
	case TableShortcut:
		shortcuts, err := s.ListShortcuts(ctx, &store.FindShortcut{})
		if err != nil {
			return err
		}
		return writeMessages(shortcuts, write)
	case TableCollection:
		collections, err := s.ListCollections(ctx, &store.FindCollection{})
		if err != nil {
			return err
		}
		return writeMessages(collections, write)
	case TableActivity:
		activities, err := s.ListActivities(ctx, &store.FindActivity{})
		if err != nil {
			return err
		}
		for _, activity := range activities {
			data, err := json.Marshal(activity)
			if err != nil {
				return err
			}
			if err := write(data); err != nil {
				return err
			}
		}
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
