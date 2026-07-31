package v1

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/yourselfhosted/slash/server/common"
	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
)

// BackupExportPath is the route a Backup is downloaded from.
//
// Unlike the rest of the v1 API this is a plain HTTP route rather than a gRPC
// method, because grpc-gateway would buffer the whole file in memory to marshal
// it, defeating the streaming that the NDJSON format exists to allow. See
// docs/adr/0003-logical-domain-level-backups.md.
const BackupExportPath = "/api/v1/workspace/backup"

// BackupRestorePath is the route a Backup is uploaded to. It is a plain HTTP
// route for the same reason as the export: the file is streamed rather than
// marshalled through gRPC.
const BackupRestorePath = "/api/v1/workspace/backup:restore"

// backupFormField is the multipart field the uploaded file arrives in.
const backupFormField = "backup"

// RegisterBackupRoutes registers the Backup routes on the given Echo instance.
func (s *APIV1Service) RegisterBackupRoutes(e *echo.Echo) {
	e.GET(BackupExportPath, s.exportBackup)
	e.POST(BackupRestorePath, s.restoreBackup)
}

func (s *APIV1Service) exportBackup(c echo.Context) error {
	ctx := c.Request().Context()

	user, err := s.authenticateRequest(c)
	if err != nil {
		return err
	}
	// A Backup carries password hashes, the Workspace secret_session, and every
	// access token, so only an admin may take one. See
	// docs/adr/0005-backups-contain-secrets-verbatim.md.
	if user.Role != store.RoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "only workspace admins may export a backup")
	}

	opts := backup.ExportOptions{
		IncludeActivities: c.QueryParam("activities") == "true",
	}

	response := c.Response()
	response.Header().Set(echo.HeaderContentType, "application/gzip")
	response.Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("attachment; filename=%q", backupFilename(s.Profile.Mode, time.Now())))
	// Nothing here knows the size in advance, so the response is chunked.
	response.WriteHeader(http.StatusOK)

	if err := backup.Export(ctx, s.Store, s.Profile, opts, response); err != nil {
		// The status line is already on the wire, so the client sees a truncated
		// gzip stream rather than an error code. Returning the error would make
		// Echo attempt a second WriteHeader; log it and cut the response instead.
		slog.Error("failed to export backup", slog.Any("error", err))
		return nil
	}
	return nil
}

// restoreBackupResponse tells the caller what to do next. A restore replaces
// secret_session, which the server caches at startup, so the instance must be
// restarted rather than the server mutating cached state or killing itself. See
// docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md.
type restoreBackupResponse struct {
	Message         string `json:"message"`
	RestartRequired bool   `json:"restartRequired"`
}

func (s *APIV1Service) restoreBackup(c echo.Context) error {
	ctx := c.Request().Context()

	user, err := s.authenticateRequest(c)
	if err != nil {
		return err
	}
	if user.Role != store.RoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "only workspace admins may restore a backup")
	}

	fileHeader, err := c.FormFile(backupFormField)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("expected a %q file upload", backupFormField))
	}
	file, err := fileHeader.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to read the uploaded file")
	}
	defer file.Close()

	if err := backup.Restore(ctx, s.Store, s.Profile, file); err != nil {
		return restoreError(err)
	}

	slog.Warn("workspace restored from a backup, restart required", slog.Int("restoredBy", int(user.ID)))
	return c.JSON(http.StatusOK, &restoreBackupResponse{
		Message:         "Restore complete. Restart this Slash instance to finish: the session secret has been replaced, and you will need to sign in again.",
		RestartRequired: true,
	})
}

// restoreError maps a restore failure onto a status code, so that an operator
// mistake reads as a 4xx with an actionable message rather than a 500.
func restoreError(err error) error {
	if errors.Is(err, backup.ErrNotEmpty) {
		return echo.NewHTTPError(http.StatusConflict, err.Error())
	}
	var mismatch *backup.VersionMismatchError
	if errors.As(err, &mismatch) {
		return echo.NewHTTPError(http.StatusBadRequest, mismatch.Error())
	}
	// The wrong file, or a truncated one. That is the operator's to fix, so it
	// reads back to them rather than into this instance's error log.
	if errors.Is(err, backup.ErrMalformedBackup) {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	slog.Error("failed to restore backup", slog.Any("error", err))
	return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("failed to restore backup: %v", err))
}

// authenticateRequest resolves the caller of a plain HTTP route, reusing the
// same token validation as the gRPC interceptor so that revoked tokens and
// archived users are rejected identically.
func (s *APIV1Service) authenticateRequest(c echo.Context) (*store.User, error) {
	ctx := c.Request().Context()

	accessToken := ""
	if authHeader := c.Request().Header.Get("Authorization"); authHeader != "" {
		parts := strings.Fields(authHeader)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return nil, echo.NewHTTPError(http.StatusUnauthorized, "authorization header format must be Bearer {token}")
		}
		accessToken = parts[1]
	} else if cookie, _ := c.Cookie(AccessTokenCookieName); cookie != nil {
		accessToken = cookie.Value
	}

	userID, err := s.authProvider.authenticate(ctx, accessToken)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "unauthorized")
	}
	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
	if err != nil || user == nil {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "unauthorized")
	}
	return user, nil
}

// backupFilename names the download so an operator can tell at a glance which
// version produced it — which matters because a restore demands an exact version
// match. See docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md.
func backupFilename(mode string, now time.Time) string {
	return fmt.Sprintf("slash-%s-%s.ndjson.gz", common.GetCurrentVersion(mode), now.UTC().Format("20060102-150405"))
}
