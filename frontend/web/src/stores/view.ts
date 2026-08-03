import { create } from "zustand";
import { persist } from "zustand/middleware";
import { matchesQuery } from "@/helpers/shortcut";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import { User } from "@/types/proto/api/v1/user_service";

// Whose Shortcuts the dashboard is showing. This is about authorship, not about
// who may resolve them — that is Visibility, and the two are independent.
export type Ownership = "all" | "mine";

export interface Filter {
  search?: string;
  // Selected Tags narrow together: a Shortcut has to carry all of them. Any
  // `tab`/`tag`/`visibility` left in a persisted filter from an earlier version
  // is inert -- nothing reads those keys now.
  tags?: string[];
  ownership?: Ownership;
}

export interface Order {
  field: "name" | "createdTs" | "updatedTs" | "view";
  direction: "asc" | "desc";
}

// Two shapes, and they answer different questions: `full` is the card grid —
// "what is in here" — and `list` is the grouped index — "what is in this
// destination / tag / week". The small-tile grid that used to sit between them
// answered neither, so it is gone; Density now covers wanting more per screen.
// Values are persisted, so this union may be extended but existing members must
// not be renamed.
export type DisplayStyle = "full" | "list";

// How tightly the card grid packs. This is a property of the grid, not of the
// Shortcut, so it is deliberately independent of Display Style.
export type Density = "comfortable" | "compact" | "dense";

// What the grouped index groups by.
export type GroupBy = "site" | "tag" | "recency";

interface ViewState {
  filter: Filter;
  order: Order;
  displayStyle: DisplayStyle;
  density: Density;
  groupBy: GroupBy;
  setFilter: (filter: Partial<Filter>) => void;
  getTags: () => string[];
  toggleTag: (tag: string) => void;
  getOrder: () => Order;
  setOrder: (order: Partial<Order>) => void;
  setDisplayStyle: (displayStyle: DisplayStyle) => void;
  setDensity: (density: Density) => void;
  setGroupBy: (groupBy: GroupBy) => void;
}

const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      filter: {},
      order: {
        field: "name",
        direction: "asc",
      },
      displayStyle: "full",
      density: "comfortable",
      groupBy: "site",
      setFilter: (filter: Partial<Filter>) => {
        set({ filter: { ...get().filter, ...filter } });
      },
      getTags: () => get().filter.tags ?? [],
      toggleTag: (tag: string) => {
        const tags = get().filter.tags ?? [];
        set({ filter: { ...get().filter, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : tags.concat(tag) } });
      },
      getOrder: () => {
        return {
          field: get().order.field || "name",
          direction: get().order.direction || "asc",
        };
      },
      setOrder: (order: Partial<Order>) => {
        set({ order: { ...get().order, ...order } });
      },
      setDisplayStyle: (displayStyle: DisplayStyle) => {
        set({ displayStyle });
      },
      setDensity: (density: Density) => {
        set({ density });
      },
      setGroupBy: (groupBy: GroupBy) => {
        set({ groupBy });
      },
    }),
    {
      name: "view",
      version: 2,
      // A Member who left the workspace on the retired tile grid comes back to
      // the card grid at the density that reads closest to it, rather than to a
      // Display Style nothing renders.
      migrate: (persisted: any, version: number) => {
        if (!persisted) {
          return persisted;
        }
        if (version < 2 && persisted.displayStyle === "compact") {
          return { ...persisted, displayStyle: "full", density: persisted.density ?? "dense" };
        }
        return persisted;
      },
    },
  ),
);

export const getFilteredShortcutList = (shortcutList: Shortcut[], filter: Filter, currentUser: User) => {
  const { search, tags, ownership } = filter;
  return shortcutList.filter((shortcut) => {
    if (ownership === "mine" && shortcut.creatorId !== currentUser.id) {
      return false;
    }
    if (tags?.length && !tags.every((tag) => shortcut.tags.includes(tag))) {
      return false;
    }
    return matchesQuery(shortcut, search ?? "");
  });
};

export const getOrderedShortcutList = (shortcutList: Shortcut[], order: Order) => {
  const { field, direction } = {
    field: order.field || "name",
    direction: order.direction || "asc",
  };
  const orderedShortcutList = shortcutList.sort((a, b) => {
    if (field === "name") {
      return direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (field === "createdTs") {
      return direction === "asc"
        ? getDateTimestamp(a.createdTime) - getDateTimestamp(b.createdTime)
        : getDateTimestamp(b.createdTime) - getDateTimestamp(a.createdTime);
    } else if (field === "updatedTs") {
      return direction === "asc"
        ? getDateTimestamp(a.updatedTime) - getDateTimestamp(b.updatedTime)
        : getDateTimestamp(b.updatedTime) - getDateTimestamp(a.updatedTime);
    } else if (field === "view") {
      return direction === "asc" ? a.viewCount - b.viewCount : b.viewCount - a.viewCount;
    } else {
      return 0;
    }
  });
  return orderedShortcutList;
};

const getDateTimestamp = (date: Date = new Date()) => {
  return new Date(date).getTime();
};

export default useViewStore;
