# Backups are logical dumps of domain models, not database dumps

Slash runs on SQLite when self-hosted and on Postgres when deployed to Railway,
and a backup must move a Workspace between the two. `pg_dump` and copying the
SQLite file both fail that requirement, and so does dumping raw column values:
`collection.shortcut_ids` is stored as a comma-joined string by the SQLite driver
and as a real `int[]` by the Postgres driver, so raw values do not survive the
crossing. We therefore serialise the domain models (`storepb.*`, `store.User`)
rather than the storage representation, and let each driver re-encode on write.

The backup file is gzipped NDJSON: a manifest on the first line, then one JSON
record per row tagged with its table. This streams in both directions at constant
memory, which matters because the `activity` table grows on every Shortcut view
and can dwarf everything else. It is also readable and greppable once unzipped.

## Consequences

- Restore needs explicit-ID insert paths in each driver, because the existing
  `Create*` methods assign fresh IDs. Postgres sequences must be advanced with
  `setval` after loading.
- Columns absent from the domain models are not backed up. Today that is only
  `shortcut.row_status`, which no code reads or writes; restore lets its default
  apply. Adding a meaningful column to a table without adding it to the model
  would silently drop it from every backup.
- Any future engine-specific encoding in a driver is a portability hazard. The
  full CI matrix (sqlite↔postgres, both directions) exists to catch exactly that.
- `activity` is excluded by default, because every view record carries the
  viewer's IP address and a backup is a file that gets copied around. Including
  it is opt-in, and the UI says plainly what opting in hands over. A backup
  without `activity` is still a complete backup: it is the one table a restore
  tolerates the absence of.
- Because the manifest names the tables the file carries, a restore can hold the
  file to its own account of itself before committing: the manifest must declare
  every table but `activity`, once each and in write order, and the records must
  match — none naming a table the manifest left out, none arriving out of the
  declared order. A file cut short is caught separately, by gzip and by the line
  reader. Adding a table to `orderedTables` therefore makes it required.
- What this cannot catch is a well-formed file that is simply missing rows: the
  manifest carries table names, not row counts, so a backup whose `shortcut`
  records were all dropped still restores as an empty-but-declared table. Row
  counts in the manifest would close that, at the cost of counting every table
  inside the export snapshot before the first byte is written.
