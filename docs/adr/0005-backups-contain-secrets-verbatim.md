# Backups contain secrets verbatim

A backup includes password hashes, the Workspace `secret_session`,
identity-provider client secrets, and Members' access-token JWTs, all unredacted
and unencrypted. This is a deliberate choice for fidelity: `secret_session` signs
every session and access token, so omitting it means a restore signs everyone out
and invalidates every issued token, and omitting IdP secrets means SSO must be
reconfigured by hand before anyone can sign in.

The consequence is that a backup file is credential material — whoever holds one
can forge sessions against the instance it came from. The export endpoint is
admin-only, the file is never logged, and the UI and docs say plainly what the
file contains. Securing it at rest is the operator's job.

## Considered options

Redacting secrets by default was rejected because it produces two restore
behaviours to document and test, and the safe-by-default one silently degrades
the thing people reach for a backup to achieve. Optional passphrase encryption
was deferred rather than dismissed: it preserves fidelity and would make backups
safe to park in cloud storage, at the cost of a second file format and a key-loss
support burden. Revisit it if backups start being stored off-box routinely.
