import { Site, formatCount, splitLink } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

interface Props {
  sites: Site[];
  // The site whose Shortcuts the pane is showing.
  selected: string;
  onSelect: (fqdn: string) => void;
  onShortcutClick: (shortcut: Shortcut) => void;
}

// Fixed or `fr` tracks only, in one literal string, so every row lines up.
const SITE_COLUMNS = "grid grid-cols-[minmax(0,1fr)_4rem] md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem] items-center gap-3.5";

// Where the links actually go. A flat roll-up could say a domain holds nine
// Shortcuts but never which nine, so selecting a site opens it beside the list
// rather than filtering something further down the page.
const SiteExplorer = ({ sites, selected, onSelect, onShortcutClick }: Props) => {
  const selectedSite = sites.find((site) => site.fqdn === selected) ?? sites[0];
  const maxVisits = sites.reduce((max, site) => Math.max(max, site.visits), 0);

  if (!selectedSite) {
    return null;
  }

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_23.75rem] gap-6 items-start">
      <div className="min-w-0 border-t border-border">
        <div className={cn(SITE_COLUMNS, "px-2.5 py-2")}>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">domain</span>
          <span className="hidden md:block font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">visits</span>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground text-right">shortcuts</span>
        </div>
        {sites.map((site) => {
          const isSelected = site.fqdn === selectedSite.fqdn;
          // A share of the busiest site, so the bars compare sites to each other
          // rather than to a round number nobody chose.
          const share = maxVisits > 0 ? Math.max(2, Math.round((site.visits / maxVisits) * 100)) : 0;
          return (
            <button
              key={site.fqdn}
              className={cn(
                SITE_COLUMNS,
                "w-full px-2.5 py-2 text-left border-l-2 transition-colors",
                isSelected ? "border-primary bg-accent/40" : "border-transparent hover:bg-accent/30",
              )}
              aria-pressed={isSelected}
              onClick={() => onSelect(site.fqdn)}
            >
              <span className="min-w-0 flex flex-row items-center gap-2">
                <span className="w-[18px] h-[18px] flex justify-center items-center overflow-clip shrink-0">
                  <LinkFavicon url={site.shortcuts[0]?.link ?? ""} />
                </span>
                <span className="shortcut-name min-w-0 truncate text-sm text-foreground">{site.fqdn}</span>
                {site.isLocal && (
                  <span className="font-mono shrink-0 px-1.5 rounded-sm border border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                    LAN
                  </span>
                )}
              </span>
              <span className="hidden md:flex flex-row items-center gap-2.5 min-w-0">
                <span className="flex-1 h-2 rounded-sm bg-muted overflow-hidden">
                  <span className="block h-full bg-primary/60" style={{ width: `${share}%` }} />
                </span>
                <span className="shortcut-name w-14 text-right text-xs text-muted-foreground">{formatCount(site.visits)}</span>
              </span>
              <span className="shortcut-name text-right text-sm text-muted-foreground">{site.count}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="px-3.5 py-3 border-b border-border">
          <div className="flex flex-row items-center gap-2 min-w-0">
            <span className="shortcut-name min-w-0 truncate text-[15px] font-medium text-foreground">{selectedSite.fqdn}</span>
            {selectedSite.isLocal && (
              <span className="font-mono shrink-0 px-1.5 rounded-sm border border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                LAN
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-row items-baseline gap-3.5">
            <span className="shortcut-name text-xs text-muted-foreground">{selectedSite.count} shortcuts</span>
            <span className="shortcut-name text-xs text-muted-foreground">{formatCount(selectedSite.visits)} visits</span>
          </div>
        </div>
        <div className="max-h-[26rem] overflow-auto flex flex-col justify-start items-stretch">
          {selectedSite.shortcuts.map((shortcut) => {
            const { path } = splitLink(shortcut.link);
            return (
              <div
                key={shortcut.id}
                className="px-3.5 py-2.5 flex flex-col gap-0.5 border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => onShortcutClick(shortcut)}
              >
                <div className="flex flex-row justify-between items-baseline gap-2.5">
                  <span className="shortcut-name min-w-0 truncate text-[13px] font-medium text-foreground">s/{shortcut.name}</span>
                  <span className="shortcut-name shrink-0 text-xs text-muted-foreground">{formatCount(shortcut.viewCount)}</span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {shortcut.title || "Untitled"}
                  {path && ` · ${path}`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="px-3.5 py-2.5 border-t border-border">
          <span className="flex flex-row items-center gap-1.5 text-xs text-muted-foreground">
            <Icon.CornerDownRight className="w-3 h-auto" />
            Click a shortcut to open its detail.
          </span>
        </div>
      </div>
    </div>
  );
};

export default SiteExplorer;
