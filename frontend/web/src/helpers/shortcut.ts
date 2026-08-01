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
  // The first few Shortcuts, as a preview; `more` is how many are not shown.
  shortcuts: Shortcut[];
  more: number;
}

const SITE_PREVIEW_SIZE = 3;

const isLocalFqdn = (fqdn: string) => /\.(arpa|local|lan|internal)$/.test(fqdn) || !fqdn.includes(".");

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
      shortcuts: group.slice(0, SITE_PREVIEW_SIZE),
      more: Math.max(0, group.length - SITE_PREVIEW_SIZE),
    }))
    .sort((a, b) => b.count - a.count || b.visits - a.visits);
};

export const formatCount = (count: number) => count.toLocaleString("en-US");
