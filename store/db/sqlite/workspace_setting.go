package sqlite

import (
	"context"
	"errors"
	"slices"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

func (d *DB) UpsertWorkspaceSetting(ctx context.Context, upsert *storepb.WorkspaceSetting) (*storepb.WorkspaceSetting, error) {
	stmt := `
		INSERT INTO workspace_setting (
			key,
			value
		)
		VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE 
		SET value = EXCLUDED.value
	`
	valueString, err := marshalWorkspaceSettingValue(upsert)
	if err != nil {
		return nil, err
	}

	if _, err := d.db.ExecContext(ctx, stmt, upsert.Key.String(), valueString); err != nil {
		return nil, err
	}

	workspaceSetting := upsert
	return workspaceSetting, nil
}

func (d *DB) ListWorkspaceSettings(ctx context.Context, find *store.FindWorkspaceSetting) ([]*storepb.WorkspaceSetting, error) {
	return listWorkspaceSettings(ctx, d.db, find)
}

func listWorkspaceSettings(ctx context.Context, q queryer, find *store.FindWorkspaceSetting) ([]*storepb.WorkspaceSetting, error) {
	where, args := []string{"1 = 1"}, []any{}

	if find.Key != storepb.WorkspaceSettingKey_WORKSPACE_SETTING_KEY_UNSPECIFIED {
		where, args = append(where, "key = ?"), append(args, find.Key.String())
	}

	query := `
		SELECT
			key,
			value
		FROM workspace_setting
		WHERE ` + strings.Join(where, " AND ")
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	list := []*storepb.WorkspaceSetting{}
	for rows.Next() {
		workspaceSetting := &storepb.WorkspaceSetting{}
		var keyString, valueString string
		if err := rows.Scan(
			&keyString,
			&valueString,
		); err != nil {
			return nil, err
		}
		workspaceSetting.Key = storepb.WorkspaceSettingKey(storepb.WorkspaceSettingKey_value[keyString])
		if workspaceSetting.Key == storepb.WorkspaceSettingKey_WORKSPACE_SETTING_GENERAL {
			workspaceSettingGeneral := &storepb.WorkspaceSetting_GeneralSetting{}
			if err := protojsonUnmarshaler.Unmarshal([]byte(valueString), workspaceSettingGeneral); err != nil {
				return nil, err
			}
			workspaceSetting.Value = &storepb.WorkspaceSetting_General{
				General: workspaceSettingGeneral,
			}
		} else if workspaceSetting.Key == storepb.WorkspaceSettingKey_WORKSPACE_SETTING_SECURITY {
			workspaceSettingSecurity := &storepb.WorkspaceSetting_SecuritySetting{}
			if err := protojsonUnmarshaler.Unmarshal([]byte(valueString), workspaceSettingSecurity); err != nil {
				return nil, err
			}
			workspaceSetting.Value = &storepb.WorkspaceSetting_Security{
				Security: workspaceSettingSecurity,
			}
		} else if workspaceSetting.Key == storepb.WorkspaceSettingKey_WORKSPACE_SETTING_SHORTCUT_RELATED {
			workspaceSettingShortcutRelated := &storepb.WorkspaceSetting_ShortcutRelatedSetting{}
			if err := protojsonUnmarshaler.Unmarshal([]byte(valueString), workspaceSettingShortcutRelated); err != nil {
				return nil, err
			}
			workspaceSetting.Value = &storepb.WorkspaceSetting_ShortcutRelated{
				ShortcutRelated: workspaceSettingShortcutRelated,
			}
		} else if workspaceSetting.Key == storepb.WorkspaceSettingKey_WORKSPACE_SETTING_IDENTITY_PROVIDER {
			workspaceSettingIdentityProvider := &storepb.WorkspaceSetting_IdentityProviderSetting{}
			if err := protojsonUnmarshaler.Unmarshal([]byte(valueString), workspaceSettingIdentityProvider); err != nil {
				return nil, err
			}
			workspaceSetting.Value = &storepb.WorkspaceSetting_IdentityProvider{
				IdentityProvider: workspaceSettingIdentityProvider,
			}
		} else if slices.Contains([]storepb.WorkspaceSettingKey{
			storepb.WorkspaceSettingKey_WORKSPACE_SETTING_SECRET_SESSION,
			storepb.WorkspaceSettingKey_WORKSPACE_SETTING_DEFAULT_VISIBILITY,
		}, workspaceSetting.Key) {
			workspaceSetting.Raw = valueString
		} else {
			continue
		}
		list = append(list, workspaceSetting)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

func (d *DB) DeleteWorkspaceSetting(ctx context.Context, key storepb.WorkspaceSettingKey) error {
	stmt := `
		DELETE FROM workspace_setting
		WHERE key = ?
	`
	if _, err := d.db.ExecContext(ctx, stmt, key.String()); err != nil {
		return err
	}
	return nil
}

// marshalWorkspaceSettingValue renders the value column for a workspace setting.
// Shared with the restore path so the two cannot drift apart as keys are added.
func marshalWorkspaceSettingValue(setting *storepb.WorkspaceSetting) (string, error) {
	var message proto.Message
	switch setting.Key {
	case storepb.WorkspaceSettingKey_WORKSPACE_SETTING_GENERAL:
		message = setting.GetGeneral()
	case storepb.WorkspaceSettingKey_WORKSPACE_SETTING_SECURITY:
		message = setting.GetSecurity()
	case storepb.WorkspaceSettingKey_WORKSPACE_SETTING_SHORTCUT_RELATED:
		message = setting.GetShortcutRelated()
	case storepb.WorkspaceSettingKey_WORKSPACE_SETTING_IDENTITY_PROVIDER:
		message = setting.GetIdentityProvider()
	default:
		return "", errors.New("invalid workspace setting key")
	}
	valueBytes, err := protojson.Marshal(message)
	if err != nil {
		return "", err
	}
	return string(valueBytes), nil
}
