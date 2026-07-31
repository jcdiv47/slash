package postgres

import (
	"context"
	"errors"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/store"
)

func (d *DB) UpsertUserSetting(ctx context.Context, upsert *storepb.UserSetting) (*storepb.UserSetting, error) {
	stmt := `
		INSERT INTO user_setting (
			user_id, key, value
		)
		VALUES ($1, $2, $3)
		ON CONFLICT(user_id, key) DO UPDATE 
		SET value = EXCLUDED.value
		RETURNING user_id, key, value
	`

	valueString, err := marshalUserSettingValue(upsert)
	if err != nil {
		return nil, err
	}

	if _, err := d.db.ExecContext(ctx, stmt, upsert.UserId, upsert.Key.String(), valueString); err != nil {
		return nil, err
	}

	userSettingMessage := upsert
	return userSettingMessage, nil
}

func (d *DB) ListUserSettings(ctx context.Context, find *store.FindUserSetting) ([]*storepb.UserSetting, error) {
	where, args := []string{"1 = 1"}, []any{}

	if v := find.Key; v != storepb.UserSettingKey_USER_SETTING_KEY_UNSPECIFIED {
		where, args = append(where, "key = "+placeholder(len(args)+1)), append(args, v.String())
	}
	if v := find.UserID; v != nil {
		where, args = append(where, "user_id = "+placeholder(len(args)+1)), append(args, *find.UserID)
	}

	query := `
		SELECT
			user_id,
			key,
			value
		FROM user_setting
		WHERE ` + strings.Join(where, " AND ")
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	userSettingList := make([]*storepb.UserSetting, 0)
	for rows.Next() {
		userSetting := &storepb.UserSetting{}
		var keyString, valueString string
		if err := rows.Scan(
			&userSetting.UserId,
			&keyString,
			&valueString,
		); err != nil {
			return nil, err
		}
		userSetting.Key = storepb.UserSettingKey(storepb.UserSettingKey_value[keyString])
		if userSetting.Key == storepb.UserSettingKey_USER_SETTING_ACCESS_TOKENS {
			userSettingAccessTokens := &storepb.UserSetting_AccessTokensSetting{}
			if err := protojson.Unmarshal([]byte(valueString), userSettingAccessTokens); err != nil {
				return nil, err
			}
			userSetting.Value = &storepb.UserSetting_AccessTokens{
				AccessTokens: userSettingAccessTokens,
			}
		} else if userSetting.Key == storepb.UserSettingKey_USER_SETTING_GENERAL {
			userSettingGeneral := &storepb.UserSetting_GeneralSetting{}
			if err := protojson.Unmarshal([]byte(valueString), userSettingGeneral); err != nil {
				return nil, err
			}
			userSetting.Value = &storepb.UserSetting_General{
				General: userSettingGeneral,
			}
		} else {
			// Skip unknown key.
			continue
		}
		userSettingList = append(userSettingList, userSetting)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return userSettingList, nil
}

// marshalUserSettingValue renders the value column for a user setting. Shared
// with the restore path so the two cannot drift apart as keys are added.
func marshalUserSettingValue(setting *storepb.UserSetting) (string, error) {
	var message proto.Message
	switch setting.Key {
	case storepb.UserSettingKey_USER_SETTING_ACCESS_TOKENS:
		message = setting.GetAccessTokens()
	case storepb.UserSettingKey_USER_SETTING_GENERAL:
		message = setting.GetGeneral()
	default:
		return "", errors.New("invalid user setting key")
	}
	valueBytes, err := protojson.Marshal(message)
	if err != nil {
		return "", err
	}
	return string(valueBytes), nil
}
