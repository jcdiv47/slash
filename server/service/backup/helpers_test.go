package backup_test

import (
	"bytes"
	"compress/gzip"
	"io"
	"testing"

	"github.com/stretchr/testify/require"
)

// gunzipForTest and gzipForTest let a test tamper with a backup's contents in
// order to exercise the paths that reject a malformed or mismatched file.
func gunzipForTest(t *testing.T, raw []byte) []byte {
	t.Helper()
	reader, err := gzip.NewReader(bytes.NewReader(raw))
	require.NoError(t, err)
	defer reader.Close()
	plain, err := io.ReadAll(reader)
	require.NoError(t, err)
	return plain
}

func gzipForTest(t *testing.T, plain []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	_, err := writer.Write(plain)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return buf.Bytes()
}
