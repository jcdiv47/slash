package sqlite

import (
	"context"
	"database/sql"

	"github.com/pkg/errors"
	// SQLite driver.
	_ "modernc.org/sqlite"

	"github.com/yourselfhosted/slash/server/profile"
	"github.com/yourselfhosted/slash/store"
)

type DB struct {
	db      *sql.DB
	profile *profile.Profile
}

// connectionParams are the query parameters every connection to the database
// carries. See NewDB for what each one buys.
const connectionParams = "?_pragma=foreign_keys(0)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"

// NewDB opens a database specified by its database driver name and a
// driver-specific data source name, usually consisting of at least a
// database name and connection information.
func NewDB(profile *profile.Profile) (store.Driver, error) {
	// Ensure a DSN is set before attempting to open the database.
	if profile.DSN == "" {
		return nil, errors.New("dsn required")
	}

	// Connect to the database with some sane settings:
	// - No shared-cache: it's obsolete; WAL journal mode is a better solution.
	// - No foreign key constraints: it's currently disabled by default, but it's a
	// good practice to be explicit and prevent future surprises on SQLite upgrades.
	// - Journal mode set to WAL: it's the recommended journal mode for most applications
	// as it prevents locking issues.
	//
	// Notes:
	// - When using the `modernc.org/sqlite` driver, each pragma must be prefixed with `_pragma=`.
	//
	// References:
	// - https://pkg.go.dev/modernc.org/sqlite#Driver.Open
	// - https://www.sqlite.org/sharedcache.html
	// - https://www.sqlite.org/pragma.html
	sqliteDB, err := sql.Open("sqlite", profile.DSN+connectionParams)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to open db with dsn: %s", profile.DSN)
	}

	driver := DB{db: sqliteDB, profile: profile}

	return &driver, nil
}

// queryer is the read half shared by *sql.DB and *sql.Tx, so the list helpers
// below can serve both an ordinary request and an export snapshot.
type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func (d *DB) GetDB() *sql.DB {
	return d.db
}

func (d *DB) Close() error {
	return d.db.Close()
}
