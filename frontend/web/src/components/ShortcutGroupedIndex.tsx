import { useMemo, useState } from "react";
import { ShortcutGroup, formatCount, groupShortcuts, splitLink } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";

interface Props {
  shortcutList: Shortcut[];
  onShortcutClick: (shortcut: Shortcut) => void;
}

// Both the group heading and its Rows are grids, and they align to each other
// only because every track is fixed or `fr` — one literal string each, since
// Tailwind cannot see a computed class. Below `md` the columns that are context
// rather than answer drop away; the Name never does.
const GROUP_COLUMNS = "grid grid-cols-[1rem_minmax(0,1fr)_auto] md:grid-cols-[1rem_minmax(0,20rem)_minmax(0,1fr)_auto] items-center gap-3";
const ROW_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_4.5rem] md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,10rem)_4.5rem_1rem] items-center gap-3.5";

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// The `list` Display Style: not a flat table of everything, but an index — the
// collection filed under the thing its Shortcuts have in common, so the first
// question a Member asks is "what is in this destination" rather than "where is
// the one I want" a hundred rows down.
const ShortcutGroupedIndex = ({ shortcutList, onShortcutClick }: Props) => {
  const viewStore = useViewStore();
  const groupBy = viewStore.groupBy || "site";
  const groups = useMemo(() => groupShortcuts(shortcutList, groupBy), [shortcutList, groupBy]);
  // Closed rather than open, so a newly appearing group is expanded by default —
  // an index that hides what just arrived is worse than one that is too tall.
  const [closedKeys, setClosedKeys] = useState<string[]>([]);

  const toggleGroup = (group: ShortcutGroup) =>
    setClosedKeys((keys) => (keys.includes(group.key) ? keys.filter((key) => key !== group.key) : keys.concat(group.key)));

  return (
    <div className="w-full flex flex-col justify-start items-stretch border-t border-border">
      {groups.map((group) => {
        const isOpen = !closedKeys.includes(group.key);
        return (
          <div key={group.key} className="w-full border-b border-border">
            <button
              className={cn(GROUP_COLUMNS, "w-full px-2.5 py-2 text-left transition-colors hover:bg-accent/40")}
              aria-expanded={isOpen}
              onClick={() => toggleGroup(group)}
            >
              <span className={cn("flex justify-center items-center text-muted-foreground transition-transform", isOpen && "rotate-90")}>
                <Icon.ChevronRight className="w-3.5 h-auto" />
              </span>
              <span className="min-w-0 flex flex-row items-baseline gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate text-sm font-medium text-foreground",
                    groupBy === "recency" ? "tracking-tight" : "shortcut-name",
                  )}
                >
                  {group.label}
                </span>
                {group.isLocal && (
                  <span className="font-mono shrink-0 px-1.5 rounded-sm border border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                    LAN
                  </span>
                )}
              </span>
              <span className="hidden md:block text-sm text-muted-foreground">{formatCount(group.visits)} visits</span>
              <span className="shortcut-name shrink-0 px-2 py-px rounded-full bg-muted text-xs text-muted-foreground">{group.count}</span>
            </button>

            {isOpen && (
              <div className="w-full pb-1">
                {group.shortcuts.map((shortcut) => {
                  const { host, path } = splitLink(shortcut.link);
                  return (
                    <div
                      key={shortcut.id}
                      className={cn(ROW_COLUMNS, "w-full pl-4 pr-2.5 md:pl-9 py-1.5 cursor-pointer transition-colors hover:bg-accent/40")}
                      onClick={() => onShortcutClick(shortcut)}
                    >
                      <a
                        className="shortcut-name min-w-0 truncate text-sm font-medium text-foreground hover:underline"
                        href={`/s/${shortcut.name}`}
                        target="_blank"
                        onClick={stopPropagation}
                      >
                        s/{shortcut.name}
                      </a>
                      <span className="hidden md:block min-w-0 truncate text-sm text-muted-foreground">
                        {shortcut.title || <span className="italic">Untitled</span>}
                      </span>
                      <a
                        className="hidden md:block min-w-0 truncate text-[13px] text-muted-foreground/80 hover:underline"
                        href={shortcut.link}
                        target="_blank"
                        onClick={stopPropagation}
                      >
                        {host}
                        {path}
                      </a>
                      <span className="shortcut-name text-right text-[13px] text-muted-foreground">{formatCount(shortcut.viewCount)}</span>
                      <span className="hidden md:flex flex-row justify-end items-center text-muted-foreground/50">
                        <Icon.ChevronRight className="w-3.5 h-auto" />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ShortcutGroupedIndex;
