// Type-only, so this stays a compile-time reference and never closes a runtime
// import cycle with the store (which imports `matchesQuery` from here).
import type { GroupBy } from "@/stores/view";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";

export interface SplitLink {
  // Including the port, so `nas.home.arpa:5000` reads the way it was typed.
  host: string;
  // Everything after the host: path, query and fragment.
  path: string;
  // Host without the port, which is what groups Shortcuts into a Site.
  fqdn: string;
}

// A Link is shown as host + the rest, so the host can be given more weight than
// the query string hanging off it.
export const splitLink = (link: string): SplitLink => {
  try {
    const url = new URL(link);
    // A bare "/" carries no information and only makes the host harder to read.
    const path = `${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
    return { host: url.host, path, fqdn: url.hostname };
  } catch {
    return { host: link, path: "", fqdn: link };
  }
};

// The character class the server accepts for a Name. Typing is normalised as it
// happens, so the field can never hold a Name the server would reject.
export const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    // Pasting a whole `s/name` should fill in the Name, not nest it.
    .replace(/^s\//, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "");

export interface NameCheck {
  isTaken: boolean;
  // One alternative rather than a list: a Member either takes it or keeps
  // typing. Empty when the Name is free, or when nothing nearby is.
  suggestion: string;
}

const SUGGESTION_LIMIT = 100;

// Whether a Name is free, answered from the Shortcuts already loaded. The
// server is still the authority — this only saves a round trip while typing.
// `ownId` is the Shortcut being edited, which does not collide with itself.
export const checkName = (name: string, shortcuts: Shortcut[], ownId?: number): NameCheck => {
  const taken = new Set(shortcuts.filter((shortcut) => shortcut.id !== ownId).map((shortcut) => shortcut.name));
  if (!name || !taken.has(name)) {
    return { isTaken: false, suggestion: "" };
  }
  for (let suffix = 2; suffix < SUGGESTION_LIMIT; suffix++) {
    if (!taken.has(`${name}${suffix}`)) {
      return { isTaken: true, suggestion: `${name}${suffix}` };
    }
  }
  return { isTaken: true, suggestion: "" };
};

export const matchesQuery = (shortcut: Shortcut, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [`s/${shortcut.name}`, shortcut.title, shortcut.description, shortcut.link, ...shortcut.tags].some((field) =>
    field.toLowerCase().includes(needle),
  );
};

export interface TagCount {
  name: string;
  count: number;
}

// Ordered by weight so the Tags worth filtering by come first; ties are
// alphabetical, so the row does not reshuffle as counts change.
export const countTags = (shortcuts: Shortcut[]): TagCount[] => {
  const counts = new Map<string, number>();
  shortcuts.forEach((shortcut) => shortcut.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export interface Site {
  fqdn: string;
  // A site that only resolves inside the network the Workspace runs on. Worth
  // marking, because a public Shortcut pointing at one resolves for nobody.
  isLocal: boolean;
  count: number;
  visits: number;
  // Every Shortcut pointing at the site, most visited first. The site explorer
  // opens a whole site beside the list, so a truncated preview would be a
  // second, quietly different answer to "what is in here".
  shortcuts: Shortcut[];
}

const isLocalFqdn = (fqdn: string) => /\.(arpa|local|lan|internal)$/.test(fqdn) || !fqdn.includes(".");

const byVisits = (a: Shortcut, b: Shortcut) => b.viewCount - a.viewCount;

// Which destinations a Workspace actually points at, rolled up by domain.
export const groupBySite = (shortcuts: Shortcut[]): Site[] => {
  const groups = new Map<string, Shortcut[]>();
  shortcuts.forEach((shortcut) => {
    const { fqdn } = splitLink(shortcut.link);
    groups.set(fqdn, (groups.get(fqdn) ?? []).concat(shortcut));
  });
  return Array.from(groups.entries())
    .map(([fqdn, group]) => ({
      fqdn,
      isLocal: isLocalFqdn(fqdn),
      count: group.length,
      visits: group.reduce((total, shortcut) => total + shortcut.viewCount, 0),
      shortcuts: [...group].sort(byVisits),
    }))
    .sort((a, b) => b.count - a.count || b.visits - a.visits);
};

export interface ShortcutGroup {
  // Stable across re-groupings, so a collapsed group stays collapsed.
  key: string;
  label: string;
  // Set for a Site group that only resolves on the local network.
  isLocal: boolean;
  count: number;
  visits: number;
  shortcuts: Shortcut[];
}

const UNTAGGED_KEY = "__untagged__";

const RECENCY_BUCKETS: { key: string; label: string; days: number }[] = [
  { key: "week", label: "Last 7 days", days: 7 },
  { key: "month", label: "Last 30 days", days: 30 },
  { key: "quarter", label: "Last 90 days", days: 90 },
  { key: "older", label: "Older", days: Number.POSITIVE_INFINITY },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const sumVisits = (shortcuts: Shortcut[]) => shortcuts.reduce((total, shortcut) => total + shortcut.viewCount, 0);

// The grouped index: the same Shortcuts, filed under the thing they have in
// common. Empty groups are never emitted — a heading with nothing under it is a
// question the index cannot answer.
export const groupShortcuts = (shortcuts: Shortcut[], groupBy: GroupBy): ShortcutGroup[] => {
  if (groupBy === "site") {
    return groupBySite(shortcuts).map((site) => ({
      key: site.fqdn,
      label: site.fqdn,
      isLocal: site.isLocal,
      count: site.count,
      visits: site.visits,
      shortcuts: site.shortcuts,
    }));
  }

  if (groupBy === "tag") {
    const groups = new Map<string, Shortcut[]>();
    shortcuts.forEach((shortcut) => {
      const keys = shortcut.tags.length > 0 ? shortcut.tags : [UNTAGGED_KEY];
      keys.forEach((key) => groups.set(key, (groups.get(key) ?? []).concat(shortcut)));
    });
    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        label: key === UNTAGGED_KEY ? "Untagged" : `#${key}`,
        isLocal: false,
        count: group.length,
        visits: sumVisits(group),
        shortcuts: [...group].sort(byVisits),
      }))
      // Untagged is a backlog rather than a subject, so it sits at the end
      // however big it grows.
      .sort((a, b) => {
        if (a.key === UNTAGGED_KEY) return 1;
        if (b.key === UNTAGGED_KEY) return -1;
        return b.count - a.count || a.label.localeCompare(b.label);
      });
  }

  const now = Date.now();
  const buckets = new Map<string, Shortcut[]>();
  shortcuts.forEach((shortcut) => {
    const updated = shortcut.updatedTime ? new Date(shortcut.updatedTime).getTime() : 0;
    const age = updated ? (now - updated) / DAY_MS : Number.POSITIVE_INFINITY;
    const bucket = RECENCY_BUCKETS.find(({ days }) => age <= days) ?? RECENCY_BUCKETS[RECENCY_BUCKETS.length - 1];
    buckets.set(bucket.key, (buckets.get(bucket.key) ?? []).concat(shortcut));
  });
  // Fixed order, oldest last: recency is a scale, so it must not reorder itself
  // by size the way Sites and Tags do.
  return RECENCY_BUCKETS.filter(({ key }) => buckets.has(key)).map(({ key, label }) => {
    const group = buckets.get(key) as Shortcut[];
    return {
      key,
      label,
      isLocal: false,
      count: group.length,
      visits: sumVisits(group),
      shortcuts: [...group].sort(byVisits),
    };
  });
};

export const formatCount = (count: number) => count.toLocaleString("en-US");
