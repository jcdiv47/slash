package httpgetter

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetHTMLMeta(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, err := w.Write([]byte(`<!doctype html><html><head><title>Page title</title><meta property="og:title" content="Site title"></head><body></body></html>`))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	metadata, err := GetHTMLMeta(server.URL)
	require.NoError(t, err)
	require.Equal(t, "Site title", metadata.Title)
}

func TestGetHTMLMetaRejectsNonHTTPURL(t *testing.T) {
	_, err := GetHTMLMeta("file:///etc/passwd")
	require.Error(t, err)
}
