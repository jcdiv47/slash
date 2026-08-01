# One header, and Shortcut detail as a dialog

The dashboard used to be a stack of chrome: a Workspace header, a tab strip of
Tags, a filter pill row, a search box and the view controls, each owning a slice
of the page before a single Shortcut appeared. Opening a Shortcut then left the
list entirely for `/shortcut/:id`, so returning to scanning meant going back.

We have folded all of that into one 56px header, shared by every route, and made
opening a Shortcut a dialog over the list it came from.

## Consequences

- There is exactly one header. It carries the mark, the section switcher and the
  Member menu everywhere; search and Display Style appear only on `/shortcuts`,
  because they act on the Shortcut collection. "New shortcut" sits with the
  filter and ordering controls above the collection itself. Nothing hides the
  header — a route that needs different chrome asks the header for it.
- Every surface sits in the same `PageContainer`, so the mark stays aligned with
  the content beneath it and the gutters never change width between routes.
- Clicking a Shortcut opens `ShortcutDetailDialog`. `/shortcut/:id` is still a
  route and still renders the page, because links to it are shared and pasted;
  it is a destination, not the way detail is normally reached.
- Tag filtering is multi-select and narrows conjunctively, which replaces both
  the Tag tab strip and the single-Tag filter pill. Filtering by Visibility went
  with them; Visibility is shown on a Shortcut, not filtered by.
- Analytics is a route (`/analytics`) rather than a mode of the dashboard, so it
  can be linked to and survives a refresh.
- Creating opens a dialog built around the Name, since that is the decision being
  made. Editing opens a dialog of the same shape, carrying the two fields
  creating leaves out — the description and the OpenGraph metadata — because
  both are written once the Shortcut exists. The fields themselves live in
  `ShortcutFormFields` and are shared, so a Link or a Tag is typed the same way
  in both. There is no longer a Shortcut drawer.
- The edit dialog saves only what changed, so Save is dead until something is,
  and it says plainly that renaming stops the old `s/name` resolving.
