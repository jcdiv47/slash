# Restore replaces everything in an empty instance, and demands an exact version match

A restore loads a backup only into an empty instance — no Shortcuts, no
Collections, at most one Member — and wipes what it finds there, including the
admin who initiated it. This lets every ID be preserved verbatim, so `creator_id`
and `collection.shortcut_ids` references need no rewriting. The alternative,
merging a backup into a populated Workspace, requires ID remapping plus conflict
rules for the unique `name` and `email` constraints; we deliberately do not
support it, and the language avoids the word "import" so nobody assumes we do.

The backup's schema version must equal the running binary's exactly, or the
restore is refused with instructions to run that version first and upgrade
afterwards. This is not fastidiousness: only one `LATEST.sql` exists per driver,
so a historical schema cannot be materialised, and migrations perform data
transforms as well as DDL (`1.0/00__visibility.sql` rewrites `PRIVATE` to
`WORKSPACE`). Loading old rows into the current schema would silently skip those
transforms. Delegating version skew to the existing, well-tested migrator is both
cheaper and more honest.

## Consequences

- The whole restore runs in one transaction with batched inserts, so a failure
  leaves the target exactly as it was.
- Restoring an old backup requires running that exact old version of Slash first.
  Backup filenames carry the version so operators can tell at a glance.
- Because a restore replaces `secret_session`, which the server caches at
  startup, the instance must be restarted afterwards. The restore response says
  so rather than the server mutating cached state or killing itself.
