import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import LinkFavicon from "@/components/LinkFavicon";
import PageContainer from "@/components/PageContainer";
import ShortcutDetailDialog from "@/components/ShortcutDetailDialog";
import { Button } from "@/components/ui/button";
import { formatCount, groupBySite, splitLink } from "@/helpers/shortcut";
import useLoading from "@/hooks/useLoading";
import { cn } from "@/lib/utils";
import { useShortcutStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";

const PAGE_SIZE = 12;

// Both tables keep their columns aligned the same way Rows do: fixed or `fr`
// tracks only, in one literal string Tailwind can see.
const SHORTCUT_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)_4rem] md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,9rem)_4.5rem_5.25rem_1.25rem] items-center gap-3";
const SITE_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_3.25rem_4rem] md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_4.5rem_5.25rem_1.25rem] items-center gap-3";

const ColumnHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn("font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground", className)}>{children}</span>
);

const Analytics = () => {
  const { t } = useTranslation();
  const loadingState = useLoading();
  const shortcutStore = useShortcutStore();
  const [site, setSite] = useState<string>("");
  const [page, setPage] = useState<number>(0);
  const [selectedShortcutId, setSelectedShortcutId] = useState<number | undefined>(undefined);
  const shortcutList = shortcutStore.getShortcutList();
  const selectedShortcut = shortcutList.find((shortcut) => shortcut.id === selectedShortcutId);

  useEffect(() => {
    shortcutStore.fetchShortcutList().finally(() => loadingState.setFinish());
  }, []);

  const sites = useMemo(() => groupBySite(shortcutList), [shortcutList]);
  // The whole table is the ranking, paginated rather than cut off at a top few.
  const ranked = useMemo(() => [...shortcutList].sort((a, b) => b.viewCount - a.viewCount), [shortcutList]);
  const rows = site ? ranked.filter((shortcut) => splitLink(shortcut.link).fqdn === site) : ranked;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  const totalVisits = shortcutList.reduce((total, shortcut) => total + shortcut.viewCount, 0);
  const untitledCount = shortcutList.filter((shortcut) => !shortcut.title).length;
  const untaggedCount = shortcutList.filter((shortcut) => shortcut.tags.length === 0).length;
  const publicCount = shortcutList.filter((shortcut) => shortcut.visibility === Visibility.PUBLIC).length;

  const stats = [
    { label: "Shortcuts", value: String(shortcutList.length), note: `${untitledCount} need a title` },
    { label: "Visits", value: formatCount(totalVisits), note: "all time" },
    { label: t("shortcut.visibility.public.self"), value: String(publicCount), note: "resolvable by anyone" },
    { label: "Untagged", value: String(untaggedCount), note: "needs cleanup" },
  ];

  if (loadingState.isLoading) {
    return null;
  }

  // Nothing to rank and nothing to roll up: the whole surface is empty, not one
  // of its tables.
  if (shortcutList.length === 0) {
    return (
      <PageContainer className="pt-6 pb-16">
        <div className="w-full py-20 flex flex-col justify-center items-center text-center">
          <p className="shortcut-name text-sm text-foreground">Nothing to measure yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Analytics fill in once the workspace has shortcuts.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      <PageContainer className="pt-6 pb-16 flex flex-col justify-start items-start">
        <div className="w-full mb-4 flex flex-row items-baseline gap-2.5">
          <h1 className="text-base font-semibold tracking-tight">{t("analytics.self")}</h1>
          <span className="text-sm text-muted-foreground">across {shortcutList.length} shortcuts</span>
        </div>

        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="px-3.5 py-3 rounded-md border border-border bg-card">
              <div className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">{stat.label}</div>
              <div className="shortcut-name mt-1.5 text-xl font-semibold text-foreground">{stat.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stat.note}</div>
            </div>
          ))}
        </div>

        <section className="w-full mt-12 pt-6 border-t border-border">
          <div className="w-full mb-4 flex flex-row items-baseline flex-wrap gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">Most visited</h2>
            <span className="text-sm text-muted-foreground">
              {site ? `${rows.length} of ${shortcutList.length} shortcuts` : `${shortcutList.length} shortcuts · ranked by visits`}
            </span>
            {site && (
              <button
                className="shortcut-name ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-primary text-xs text-primary-foreground"
                onClick={() => {
                  setSite("");
                  setPage(0);
                }}
              >
                {site}
                <Icon.X className="w-3 h-auto" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className={cn(SHORTCUT_COLUMNS, "px-2.5 pb-2")}>
            <ColumnHeader>Shortcut</ColumnHeader>
            <ColumnHeader>Link</ColumnHeader>
            <ColumnHeader className="hidden md:block">Tags</ColumnHeader>
            <ColumnHeader className="text-right">{t("filter.order-by-visits")}</ColumnHeader>
            {/* The concept asks for "Last used"; a Shortcut carries no
                last-visited timestamp, so this is when it last changed. */}
            <ColumnHeader className="hidden md:block text-right">{t("filter.order-by-updated")}</ColumnHeader>
            <span className="hidden md:block" />
          </div>

          <div className="w-full flex flex-col justify-start items-stretch divide-y divide-border border-t border-border">
            {pageRows.map((shortcut) => {
              const { host, path } = splitLink(shortcut.link);
              return (
                <div
                  key={shortcut.id}
                  className={cn(SHORTCUT_COLUMNS, "px-2.5 py-2.5 cursor-pointer transition-colors hover:bg-accent/40")}
                  onClick={() => setSelectedShortcutId(shortcut.id)}
                >
                  <div className="min-w-0 flex flex-row items-center gap-2.5">
                    <div className="w-[18px] h-[18px] flex justify-center items-center overflow-clip shrink-0">
                      <LinkFavicon url={shortcut.link} />
                    </div>
                    <div className="min-w-0">
                      {shortcut.title ? (
                        <div className="truncate text-sm font-medium text-foreground">{shortcut.title}</div>
                      ) : (
                        <div className="text-sm italic text-muted-foreground">Untitled</div>
                      )}
                      <div className="shortcut-name mt-0.5 truncate text-xs text-muted-foreground">s/{shortcut.name}</div>
                    </div>
                  </div>
                  <div className="min-w-0 truncate text-sm">
                    <span className="text-foreground">{host}</span>
                    <span className="text-muted-foreground">{path}</span>
                  </div>
                  <div className="hidden md:flex flex-row items-center gap-1.5 overflow-hidden">
                    {shortcut.tags.length === 0 ? (
                      <span className="text-sm text-muted-foreground">＋ tag it</span>
                    ) : (
                      shortcut.tags.map((tag) => (
                        <span key={tag} className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-muted text-xs text-muted-foreground">
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="shortcut-name text-right text-sm text-foreground">{formatCount(shortcut.viewCount)}</div>
                  <div className="hidden md:block text-right text-xs text-muted-foreground">
                    {shortcut.updatedTime ? new Date(shortcut.updatedTime).toLocaleDateString() : "—"}
                  </div>
                  <div className="hidden md:flex flex-row justify-end items-center text-muted-foreground/60">
                    <Icon.ChevronRight className="w-4 h-auto" />
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="w-full py-12 flex flex-col justify-center items-center text-center">
                <p className="text-sm text-muted-foreground">No shortcuts to rank.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8"
                  onClick={() => {
                    setSite("");
                    setPage(0);
                  }}
                >
                  Reset filters
                </Button>
              </div>
            )}
          </div>

          {pageCount > 1 && (
            <div className="mt-4 flex flex-row items-center gap-3.5">
              <span className="shortcut-name hidden sm:inline text-xs text-muted-foreground">
                {rows.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}` : "0 of 0"}
              </span>
              <div className="ml-auto flex flex-row items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-7 h-7 px-0"
                  aria-label="Previous page"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <Icon.ChevronLeft className="w-3.5 h-auto" />
                </Button>
                {/* A long page list wraps badly on a phone, so there it collapses
                    to a single readout between the arrows. */}
                <span className="shortcut-name sm:hidden px-2.5 text-sm text-muted-foreground">
                  {currentPage + 1} / {pageCount}
                </span>
                <div className="hidden sm:flex flex-row items-center gap-1">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      className={cn(
                        "shortcut-name min-w-7 h-7 px-2 rounded-md text-sm transition-colors",
                        i === currentPage
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "border border-input text-muted-foreground hover:text-foreground",
                      )}
                      aria-current={i === currentPage}
                      onClick={() => setPage(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-7 h-7 px-0"
                  aria-label="Next page"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <Icon.ChevronRight className="w-3.5 h-auto" />
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="w-full mt-12 pt-6 border-t border-border">
          <div className="w-full mb-4 flex flex-row items-baseline flex-wrap gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">All sites</h2>
            <span className="text-sm text-muted-foreground">{sites.length} sites · grouped by fully qualified domain</span>
          </div>

          <div className={cn(SITE_COLUMNS, "px-2.5 pb-2")}>
            <ColumnHeader>Domain</ColumnHeader>
            <ColumnHeader className="hidden md:block">Shortcuts</ColumnHeader>
            <ColumnHeader className="text-right">Count</ColumnHeader>
            <ColumnHeader className="text-right">{t("filter.order-by-visits")}</ColumnHeader>
            <span className="hidden md:block" />
          </div>

          <div className="w-full flex flex-col justify-start items-stretch divide-y divide-border border-t border-border">
            {sites.map((entry) => (
              <div
                key={entry.fqdn}
                className={cn(SITE_COLUMNS, "px-2.5 py-2.5 cursor-pointer transition-colors hover:bg-accent/40")}
                onClick={() => {
                  setSite(site === entry.fqdn ? "" : entry.fqdn);
                  setPage(0);
                }}
              >
                <div className="min-w-0 flex flex-row items-center gap-2.5">
                  <div className="w-[18px] h-[18px] flex justify-center items-center overflow-clip shrink-0">
                    <LinkFavicon url={entry.shortcuts[0]?.link ?? ""} />
                  </div>
                  <span className="shortcut-name min-w-0 truncate text-sm text-foreground">{entry.fqdn}</span>
                  {entry.isLocal && (
                    <span className="font-mono shrink-0 px-1.5 rounded-sm border border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                      LAN
                    </span>
                  )}
                  {site === entry.fqdn && <Icon.Check className="w-3.5 h-auto shrink-0 text-foreground" strokeWidth={2.5} />}
                </div>
                <div className="hidden md:flex flex-row items-center gap-1.5 overflow-hidden">
                  {entry.shortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedShortcutId(shortcut.id);
                      }}
                    >
                      s/{shortcut.name}
                    </button>
                  ))}
                  {entry.more > 0 && <span className="shortcut-name shrink-0 text-xs text-muted-foreground">+{entry.more}</span>}
                </div>
                <div className="shortcut-name text-right text-sm text-foreground">{entry.count}</div>
                <div className="shortcut-name text-right text-sm text-muted-foreground">{formatCount(entry.visits)}</div>
                <div className="hidden md:flex flex-row justify-end items-center text-muted-foreground/60">
                  <Icon.ChevronRight className="w-4 h-auto" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </PageContainer>

      {selectedShortcut && <ShortcutDetailDialog shortcut={selectedShortcut} onClose={() => setSelectedShortcutId(undefined)} />}
    </>
  );
};

export default Analytics;
