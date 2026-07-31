# Slash

Slash turns long, unwieldy URLs into short, human-readable links that a team can
remember, share, and organise. It is self-hosted: a single binary that an
organisation runs on its own infrastructure.

## Language

### Links

**Shortcut**:
A named redirect from a memorable name to a destination URL, resolved at
`s/{name}`.
_Avoid_: Link, short link, alias, bookmark

**Name**:
The human-readable identifier a Shortcut or Collection is addressed by. Unique
within a Workspace.
_Avoid_: Slug, key, path, ID

**Link**:
The destination URL a Shortcut points at. Distinct from the Shortcut itself.
_Avoid_: Target, URL, destination

**Collection**:
A curated, shareable group of Shortcuts, resolved at `c/{name}`. Grouping is
editorial and ordered, which is what distinguishes it from a Tag.
_Avoid_: Folder, group, list, board

**Tag**:
A free-form label on a Shortcut, used to filter. Unlike a Collection, a Tag has
no owner, no order, and no page of its own.
_Avoid_: Category, label, keyword

**Visibility**:
Who may resolve a Shortcut or Collection — private to its creator, shared within
the Workspace, or public to anyone.
_Avoid_: Permission, access level, scope, privacy

### Workspace

**Workspace**:
A single Slash instance and everything in it. There is exactly one per
deployment, so it is the outermost boundary rather than a tenant.
_Avoid_: Organisation, team, tenant, instance

**Branding**:
A Workspace-supplied logo that replaces the default mark. Any visual design must
survive being shown next to an unknown Branding image.
_Avoid_: Custom logo, white-label, theme

**Member**:
A person with an account in the Workspace.
_Avoid_: User, account, teammate

**Activity**:
A record that something happened in the Workspace — chiefly that a Shortcut was
viewed. Activities are the sole source of analytics.
_Avoid_: Event, log entry, hit

### Presentation

**Display Style**:
Which shape the Shortcut collection takes on a dashboard. `full` is a grid of
cards, `compact` a grid of smaller tiles, and `list` the one row-based style,
with columns aligned down the page.
_Avoid_: Layout, view mode, density

**Row**:
A single Shortcut rendered as one line of the `list` Display Style. Rows share a
column template, so a Row is only meaningful as part of a list — unlike a card or
tile, which stands alone.
_Avoid_: Line, item, record, entry

**Destructive**:
An action a Member cannot undo, such as deleting a Shortcut. The canonical term
for both the confirmation dialog and the styling of the control that triggers it.
_Avoid_: Danger, dangerous, delete, warning

**Accent**:
The single brand hue (amber). It carries identity only and never state — it is
not a warning colour. See
[ADR 0002](./docs/adr/0002-accent-may-fill-never-letter.md).
_Avoid_: Primary colour, brand colour, highlight

### Backup

**Backup**:
A single file holding every row of the Workspace at one point in time, portable
between storage engines. See
[ADR 0003](./docs/adr/0003-logical-domain-level-backups.md).
_Avoid_: Dump, snapshot, archive

**Manifest**:
The self-describing header of a Backup, stating what the file contains and which
version of Slash produced it.
_Avoid_: Metadata, header

**Export**:
Producing a Backup from a running Workspace.
_Avoid_: Download, dump

**Restore**:
Loading a Backup into an Empty Instance, replacing its contents wholesale. Slash
has no notion of importing a Backup into a populated Workspace. See
[ADR 0004](./docs/adr/0004-restore-is-replace-all-into-an-empty-instance.md).
_Avoid_: Import, merge, sync

**Empty Instance**:
A Workspace with no Shortcuts, no Collections, and at most one Member — the state
a Restore requires of its target.
_Avoid_: Fresh install, clean instance
