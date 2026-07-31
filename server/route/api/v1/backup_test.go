package v1

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// TestBackupRouteBeatsGatewayCatchAll pins the routing precedence this endpoint
// depends on: the gRPC gateway claims "/api/v1/*", and the backup route must
// still win for its own path or downloads would be proxied into gRPC.
func TestBackupRouteBeatsGatewayCatchAll(t *testing.T) {
	e := echo.New()

	backupHandlerCalled := false
	e.GET(BackupExportPath, func(c echo.Context) error {
		backupHandlerCalled = true
		return c.NoContent(http.StatusOK)
	})
	// Mirrors how RegisterGateway claims the rest of the API surface.
	e.Any("/api/v1/*", func(c echo.Context) error {
		return c.NoContent(http.StatusTeapot)
	})

	request := httptest.NewRequest(http.MethodGet, BackupExportPath, nil)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)

	require.True(t, backupHandlerCalled, "backup route was shadowed by the gateway catch-all")
	require.Equal(t, http.StatusOK, recorder.Code)

	// A neighbouring path must still reach the gateway.
	request = httptest.NewRequest(http.MethodGet, "/api/v1/workspace", nil)
	recorder = httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusTeapot, recorder.Code)
}

func TestBackupFilenameCarriesVersionAndTime(t *testing.T) {
	name := backupFilename("prod", time.Date(2026, 7, 31, 9, 30, 0, 0, time.UTC))
	require.Equal(t, "slash-1.0.0-20260731-093000.ndjson.gz", name)
}

// TestExportBackupRejectsAnonymous guards the endpoint that hands out every
// secret in the Workspace.
func TestExportBackupRejectsAnonymous(t *testing.T) {
	e := echo.New()
	service := &APIV1Service{authProvider: NewGRPCAuthInterceptor(nil, "secret")}
	service.RegisterBackupRoutes(e)

	request := httptest.NewRequest(http.MethodGet, BackupExportPath, nil)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
}
