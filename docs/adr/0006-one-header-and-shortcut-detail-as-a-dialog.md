# One header, and Shortcut detail as a dialog

The dashboard used to be a stack of chrome: a Workspace header, a tab strip of
Tags, a filter pill row, a search box and the view controls, each owning a slice
of the page before a single Shortcut appeared. Opening a Shortcut then left the
list entirely for `/shortcut/:id`, so returning to scanning meant going back.

We have folded all of that into one 56px header, shared by every route, and made
opening a Shortcut a dialog over the list it came from.

## Consequences

- There is exactly one header. It carries the mark, the section switcher and the
  Member menu everywhere; search, Display Style and "New shortcut" appear only on
  `/shortcuts`, because they act on the Shortcut collection. Nothing hides the
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
  made; editing still opens the drawer, which is the only place the full form
  (description, OpenGraph metadata) lives.
