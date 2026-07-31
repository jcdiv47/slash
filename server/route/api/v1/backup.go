package v1

import (
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

// RegisterBackupRoutes registers the Backup routes on the given Echo instance.
func (s *APIV1Service) RegisterBackupRoutes(e *echo.Echo) {
	e.GET(BackupExportPath, s.exportBackup)
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
