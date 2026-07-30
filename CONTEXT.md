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

### Presentation

**Display Style**:
Which shape the Shortcut grid takes. `full` shows a card per Shortcut; `compact`
shows a smaller tile per Shortcut. Both are grids — neither is a row-based list,
so "list" remains an unused term.
_Avoid_: Layout, view mode, density

**Destructive**:
An action a Member cannot undo, such as deleting a Shortcut. The canonical term
for both the confirmation dialog and the styling of the control that triggers it.
_Avoid_: Danger, dangerous, delete, warning

**Accent**:
The single brand hue (amber). It carries identity only and never state — it is
not a warning colour. See
[ADR 0002](./docs/adr/0002-accent-may-fill-never-letter.md).
_Avoid_: Primary colour, brand colour, highlight
