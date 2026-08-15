package v1

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMapToAnalyticsSliceSortsByCountDescending(t *testing.T) {
	items := mapToAnalyticsSlice(map[string]int32{
		"least":  1,
		"z-tied": 3,
		"most":   5,
		"a-tied": 3,
	})

	assert.Len(t, items, 4)
	assert.Equal(t, "most", items[0].Name)
	assert.Equal(t, int32(5), items[0].Count)
	assert.Equal(t, "a-tied", items[1].Name)
	assert.Equal(t, int32(3), items[1].Count)
	assert.Equal(t, "z-tied", items[2].Name)
	assert.Equal(t, int32(3), items[2].Count)
	assert.Equal(t, "least", items[3].Name)
	assert.Equal(t, int32(1), items[3].Count)
}
