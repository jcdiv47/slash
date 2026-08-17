package backup_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	storepb "github.com/yourselfhosted/slash/proto/gen/store"
	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/server/service/backup"
	"github.com/yourselfhosted/slash/store"
	teststore "github.com/yourselfhosted/slash/store/test"
)

// TestExportIsConsistentUnderConcurrentWrites checks the end-to-end property the
// snapshot exists for: a Workspace that is being used while the Backup is
// written must not produce a file whose activity refers to a Shortcut the same
// file does not contain.
//
// Shortcuts are written before activities, so without a snapshot every pair the
// writer below creates in between lands in the Backup half-present. The rows
// seeded first widen that window; even so this is a probabilistic backstop
// checking that Export actually goes through the snapshot, and the guarantee
// itself is pinned deterministically by TestExportTxIsIsolatedFromConcurrentWrites
// in store/test.
func TestExportIsConsistentUnderConcurrentWrites(t *testing.T) {
	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	user := seed(ctx, t, ts)

	// Collections are read after shortcuts and before activities, so seeding them
	// stretches the window a non-snapshot export would leak through.
	for i := 0; i < 500; i++ {
		_, err := ts.CreateCollection(ctx, &storepb.Collection{
			CreatorId:   user.ID,
			Name:        fmt.Sprintf("seeded-%d", i),
			ShortcutIds: []int32{1},
			Visibility:  storepb.Visibility_WORKSPACE,
		})
		require.NoError(t, err)
	}
	for i := 0; i < 500; i++ {
		_, err := ts.CreateActivity(ctx, &store.Activity{
			CreatorID: user.ID,
			Type:      store.ActivityShortcutView,
			Level:     store.ActivityInfo,
			Payload:   `{"shortcutId":1}`,
		})
		require.NoError(t, err)
	}

	stop := make(chan struct{})
	var writer sync.WaitGroup
	writer.Add(1)
	go func() {
		defer writer.Done()
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			shortcut, err := ts.CreateShortcut(ctx, &storepb.Shortcut{
				CreatorId:  user.ID,
				Name:       fmt.Sprintf("concurrent-%d", i),
				Link:       "https://example.com",
				Visibility: storepb.Visibility_WORKSPACE,
			})
			if err != nil {
				return
			}
			if _, err := ts.CreateActivity(ctx, &store.Activity{
				CreatorID: user.ID,
				Type:      store.ActivityShortcutView,
				Level:     store.ActivityInfo,
				Payload:   fmt.Sprintf(`{"shortcutId":%d}`, shortcut.Id),
			}); err != nil {
				return
			}
		}
	}()
	// Let the writer get going, so it is mid-flight when the export starts.
	time.Sleep(10 * time.Millisecond)

	var buf bytes.Buffer
	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{IncludeActivities: true}, &buf)
	close(stop)
	writer.Wait()
	require.NoError(t, err)

	_, records := readBackup(t, buf.Bytes())

	shortcutIDs := map[int32]bool{}
	for _, record := range records[backup.TableShortcut] {
		shortcut := struct {
			ID int32 `json:"id"`
		}{}
		require.NoError(t, json.Unmarshal(record, &shortcut))
		shortcutIDs[shortcut.ID] = true
	}
	require.NotEmpty(t, shortcutIDs)

	for _, record := range records[backup.TableActivity] {
		activity := &store.Activity{}
		require.NoError(t, json.Unmarshal(record, activity))
		payload := struct {
			ShortcutID int32 `json:"shortcutId"`
		}{}
		require.NoError(t, json.Unmarshal([]byte(activity.Payload), &payload))
		require.True(t, shortcutIDs[payload.ShortcutID],
			"activity %d references shortcut %d, which the same backup does not contain",
			activity.ID, payload.ShortcutID)
	}
}

// TestExportActivityMemoryIsBounded guards the reason activities are streamed
// rather than listed: activity is the table that grows without bound, and an
// export of a busy Workspace must not need the whole table resident.
//
// The threshold is deliberately far below the size of the rows being exported,
// so it distinguishes streaming from materialising rather than measuring
// allocator noise.
func TestExportActivityMemoryIsBounded(t *testing.T) {
	if testing.Short() {
		t.Skip("seeds thousands of activities")
	}

	ctx := context.Background()
	ts := teststore.NewTestingStore(ctx, t)
	user := seed(ctx, t, ts)

	const (
		activityCount   = 2000
		payloadSize     = 8 * 1024
		maxHeapGrowth   = 8 * 1024 * 1024
		totalRowPayload = activityCount * payloadSize // 16MiB, twice the ceiling.
	)
	padding := string(bytes.Repeat([]byte("x"), payloadSize))
	for i := 0; i < activityCount; i++ {
		_, err := ts.CreateActivity(ctx, &store.Activity{
			CreatorID: user.ID,
			Type:      store.ActivityShortcutView,
			Level:     store.ActivityInfo,
			Payload:   fmt.Sprintf(`{"shortcutId":1,"padding":%q}`, padding),
		})
		require.NoError(t, err)
	}

	// Establish a stable baseline before measuring live heap growth.
	runtime.GC() //nolint:revive // Calling GC is the behavior this memory-bound test needs.
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	// Sample the live heap while the export runs: what matters is the peak, not
	// the total allocated, which grows with the row count either way.
	var peak uint64
	sampling := make(chan struct{})
	var sampler sync.WaitGroup
	sampler.Add(1)
	go func() {
		defer sampler.Done()
		var stats runtime.MemStats
		for {
			select {
			case <-sampling:
				return
			default:
			}
			runtime.ReadMemStats(&stats)
			if stats.HeapAlloc > peak {
				peak = stats.HeapAlloc
			}
			time.Sleep(200 * time.Microsecond)
		}
	}()

	err := backup.Export(ctx, ts, &profile.Profile{Mode: "prod"}, backup.ExportOptions{IncludeActivities: true}, io.Discard)
	close(sampling)
	sampler.Wait()
	require.NoError(t, err)

	growth := int64(peak) - int64(before.HeapAlloc)
	require.Less(t, growth, int64(maxHeapGrowth),
		"export held %d bytes of heap for %d bytes of activity rows; it should stream them",
		growth, totalRowPayload)
}
