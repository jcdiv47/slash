package v1

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/store"
	teststore "github.com/yourselfhosted/slash/store/test"
)

const testSecret = "test-secret"

// signIn creates a user of the given role and returns a usable access token,
// registering it the way the auth service does so the interceptor accepts it.
func signIn(t *testing.T, ts *store.Store, email string, role store.Role) string {
	t.Helper()
	ctx := context.Background()

	user, err := ts.CreateUser(ctx, &store.User{
		Email:        email,
		Nickname:     email,
		PasswordHash: "irrelevant",
		Role:         role,
	})
	require.NoError(t, err)

	token, err := GenerateAccessToken(user.Email, user.ID, time.Now().Add(time.Hour), []byte(testSecret))
	require.NoError(t, err)

	// authenticate() checks the token against the user's stored tokens, so a
	// merely well-signed JWT is not enough.
	_, err = ts.UpsertUserSetting(ctx, &storepb.UserSetting{
		UserId: user.ID,
		Key:    storepb.UserSettingKey_USER_SETTING_ACCESS_TOKENS,
		Value: &storepb.UserSetting_AccessTokens{
			AccessTokens: &storepb.UserSetting_AccessTokensSetting{
				AccessTokens: []*storepb.UserSetting_AccessTokensSetting_AccessToken{
					{AccessToken: token, Description: "test"},
				},
			},
		},
	})
	require.NoError(t, err)

	return token
}

func newBackupTestServer(t *testing.T, ts *store.Store) *echo.Echo {
	t.Helper()
	e := echo.New()
	service := &APIV1Service{
		Secret:       testSecret,
		Profile:      &profile.Profile{Mode: "prod"},
		Store:        ts,
		authProvider: NewGRPCAuthInterceptor(ts, testSecret),
	}
	service.RegisterBackupRoutes(e)
	return e
}

func exportWithToken(t *testing.T, e *echo.Echo, token string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, BackupExportPath, nil)
	if token != "" {
		request.AddCookie(&http.Cookie{Name: AccessTokenCookieName, Value: token})
	}
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	return recorder
}

// TestExportBackupRequiresAdmin is the security boundary for this endpoint: a
// backup hands out every password hash and access token in the Workspace.
func TestExportBackupRequiresAdmin(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	e := newBackupTestServer(t, ts)

	adminToken := signIn(t, ts, "admin@slash.com", store.RoleAdmin)
	memberToken := signIn(t, ts, "member@slash.com", store.RoleUser)

	t.Run("admin may export", func(t *testing.T) {
		recorder := exportWithToken(t, e, adminToken)
		require.Equal(t, http.StatusOK, recorder.Code)
		require.Equal(t, "application/gzip", recorder.Header().Get(echo.HeaderContentType))
		require.Contains(t, recorder.Header().Get(echo.HeaderContentDisposition), ".ndjson.gz")
		require.NotEmpty(t, recorder.Body.Bytes())
	})

	t.Run("member may not export", func(t *testing.T) {
		recorder := exportWithToken(t, e, memberToken)
		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.NotContains(t, recorder.Body.String(), "ndjson")
	})

	t.Run("anonymous may not export", func(t *testing.T) {
		recorder := exportWithToken(t, e, "")
		require.Equal(t, http.StatusUnauthorized, recorder.Code)
	})

	t.Run("garbage token may not export", func(t *testing.T) {
		recorder := exportWithToken(t, e, "not-a-jwt")
		require.Equal(t, http.StatusUnauthorized, recorder.Code)
	})
}

// uploadBackup posts a backup file to the restore endpoint as multipart form data.
func uploadBackup(t *testing.T, e *echo.Echo, token string, content []byte) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("backup", "backup.ndjson.gz")
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, BackupRestorePath, &body)
	request.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	if token != "" {
		request.AddCookie(&http.Cookie{Name: AccessTokenCookieName, Value: token})
	}
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	return recorder
}

// TestRestoreBackupEndpoint covers the round trip through HTTP, plus the status
// codes an operator mistake should produce.
func TestRestoreBackupEndpoint(t *testing.T) {
	ctx := context.Background()

	// Produce a real backup from a populated instance.
	source := teststore.NewTestingStore(ctx, t)
	sourceAdmin := signIn(t, source, "admin@slash.com", store.RoleAdmin)
	sourceEcho := newBackupTestServer(t, source)
	exported := exportWithToken(t, sourceEcho, sourceAdmin).Body.Bytes()
	require.NotEmpty(t, exported)

	t.Run("anonymous may not restore", func(t *testing.T) {
		target := teststore.NewTestingStore(ctx, t)
		recorder := uploadBackup(t, newBackupTestServer(t, target), "", exported)
		require.Equal(t, http.StatusUnauthorized, recorder.Code)
	})

	t.Run("member may not restore", func(t *testing.T) {
		target := teststore.NewTestingStore(ctx, t)
		memberToken := signIn(t, target, "member@slash.com", store.RoleUser)
		recorder := uploadBackup(t, newBackupTestServer(t, target), memberToken, exported)
		require.Equal(t, http.StatusForbidden, recorder.Code)
	})

	t.Run("non-empty instance is a conflict", func(t *testing.T) {
		target := teststore.NewTestingStore(ctx, t)
		adminToken := signIn(t, target, "admin@slash.com", store.RoleAdmin)
		_, err := target.CreateShortcut(ctx, &storepb.Shortcut{
			CreatorId: 1, Name: "existing", Link: "https://example.com", Visibility: storepb.Visibility_WORKSPACE,
		})
		require.NoError(t, err)

		recorder := uploadBackup(t, newBackupTestServer(t, target), adminToken, exported)
		require.Equal(t, http.StatusConflict, recorder.Code)
	})

	t.Run("garbage upload is a bad request", func(t *testing.T) {
		target := teststore.NewTestingStore(ctx, t)
		adminToken := signIn(t, target, "admin@slash.com", store.RoleAdmin)
		recorder := uploadBackup(t, newBackupTestServer(t, target), adminToken, []byte("not a backup"))
		require.Equal(t, http.StatusBadRequest, recorder.Code)
	})

	t.Run("admin restores onto a fresh instance", func(t *testing.T) {
		target := teststore.NewTestingStore(ctx, t)
		adminToken := signIn(t, target, "installer@slash.com", store.RoleAdmin)

		recorder := uploadBackup(t, newBackupTestServer(t, target), adminToken, exported)
		require.Equal(t, http.StatusOK, recorder.Code)
		require.Contains(t, recorder.Body.String(), "restartRequired")
		require.Contains(t, recorder.Body.String(), "Restart this Slash instance")

		// The installing admin has been replaced by the backup's own user.
		users, err := target.ListUsers(ctx, &store.FindUser{})
		require.NoError(t, err)
		require.Len(t, users, 1)
		require.Equal(t, "admin@slash.com", users[0].Email)
	})
}
