import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useLocalStorage from "react-use/lib/useLocalStorage";
import CreateShortcutDialog from "@/components/CreateShortcutDialog";
import DensityToggle from "@/components/DensityToggle";
import GroupByToggle from "@/components/GroupByToggle";
import Icon from "@/components/Icon";
import PageContainer from "@/components/PageContainer";
import ShortcutDetailDialog from "@/components/ShortcutDetailDialog";
import ShortcutsContainer from "@/components/ShortcutsContainer";
import TagFilter from "@/components/TagFilter";
import ViewSetting from "@/components/ViewSetting";
import { Button } from "@/components/ui/button";
import { countTags, groupShortcuts, matchesQuery } from "@/helpers/shortcut";
import useLoading from "@/hooks/useLoading";
import { cn } from "@/lib/utils";
import { useShortcutStore, useUserStore, useViewStore } from "@/stores";
import { GroupBy, Ownership, getFilteredShortcutList, getOrderedShortcutList } from "@/stores/view";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";

const ownershipOptions: { value: Ownership; labelKey: string }[] = [
  { value: "all", labelKey: "filter.all" },
  { value: "mine", labelKey: "filter.personal" },
];

// What a group stands for, so the count line says what was counted rather than
// repeating "groups".
const groupNouns: Record<GroupBy, string> = {
  site: "destinations",
  tag: "tags",
  recency: "periods",
};

const ShortcutDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [, setLastVisited] = useLocalStorage<string>("lastVisited", "/shortcuts");
  const loadingState = useLoading();
  const currentUser = useUserStore().getCurrentUser();
  const shortcutStore = useShortcutStore();
  const viewStore = useViewStore();
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const [selectedShortcutId, setSelectedShortcutId] = useState<number | undefined>(undefined);
  const shortcutList = shortcutStore.getShortcutList();
  const filter = viewStore.filter;
  const selectedTags = viewStore.getTags();
  const ownership = filter.ownership ?? "all";
  const displayStyle = viewStore.displayStyle || "full";
  const groupBy = viewStore.groupBy || "site";
  const isIndex = displayStyle === "list";
  const filteredShortcutList = getFilteredShortcutList(shortcutList, filter, currentUser);
  const orderedShortcutList = getOrderedShortcutList(filteredShortcutList, viewStore.order);
  const untitledCount = shortcutList.filter((shortcut) => !shortcut.title).length;
  const isNarrowed = selectedTags.length > 0 || Boolean(filter.search) || ownership === "mine";
  // Only counted for the index's own count line — the grid never asks.
  const groupCount = useMemo(
    () => (isIndex ? groupShortcuts(orderedShortcutList, groupBy).length : 0),
    [isIndex, orderedShortcutList, groupBy],
  );
  // Tag counts come from the search-filtered set rather than the fully filtered
  // one, so selecting a Tag does not immediately rewrite the row it was picked
  // from.
  const tagOptions = useMemo(
    () => countTags(shortcutList.filter((shortcut) => matchesQuery(shortcut, filter.search ?? ""))),
    [shortcutList, filter.search],
  );
  // Resolved out of the store rather than held as an object, so deleting the
  // Shortcut from the dialog closes it.
  const selectedShortcut = shortcutList.find((shortcut) => shortcut.id === selectedShortcutId);

  useEffect(() => {
    setLastVisited("/shortcuts");
    shortcutStore.fetchShortcutList().finally(() => loadingState.setFinish());
  }, []);

  const handleShortcutClick = (shortcut: Shortcut) => setSelectedShortcutId(shortcut.id);

  const countLabel = isIndex
    ? `${groupCount} ${groupNouns[groupBy]} · ${orderedShortcutList.length}${isNarrowed ? ` of ${shortcutList.length}` : ""} shortcuts`
    : isNarrowed
      ? `${orderedShortcutList.length} of ${shortcutList.length} shortcuts`
      : `${shortcutList.length} shortcuts · ${untitledCount} untitled`;

  return (
    <>
      <PageContainer className="pt-6 pb-16 flex flex-col justify-start items-start">
        <div className="w-full mb-4 flex flex-row justify-between items-center gap-3">
          <div className="min-w-0 flex flex-row items-baseline gap-2.5">
            <h1 className="text-base font-semibold tracking-tight">Shortcuts</h1>
            <span className="truncate text-sm text-muted-foreground">{countLabel}</span>
          </div>
          <div className="shrink-0 flex flex-row justify-end items-center gap-2">
            <div className="flex flex-row items-center gap-0.5 p-0.5 rounded-md border border-input">
              {ownershipOptions.map(({ value, labelKey }) => (
                <button
                  key={value}
                  className={cn(
                    "h-6 px-2.5 rounded-sm text-sm transition-colors",
                    value === ownership ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={value === ownership}
                  onClick={() => viewStore.setFilter({ ownership: value })}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            {/* Each shape gets only the controls that shape it: the grid is
                packed and ordered, the index is grouped. */}
            {isIndex ? <GroupByToggle /> : <DensityToggle />}
            <ViewSetting />
            {/* Creating acts on the collection below, so it sits at the end of
                the row that shapes it rather than up in the header. */}
            <Button size="sm" className="h-8 px-2.5" onClick={() => setShowCreateDialog(true)}>
              <Icon.Plus className="w-4 h-auto" />
              <span className="hidden md:inline">New shortcut</span>
            </Button>
          </div>
        </div>

        <TagFilter tags={tagOptions} />

        {loadingState.isLoading ? (
          // Card-shaped placeholders rather than a spinner, so the surface holds
          // its shape while the list arrives.
          <div className="w-full grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-28 rounded-md border border-border bg-card opacity-60" />
            ))}
          </div>
        ) : orderedShortcutList.length === 0 ? (
          <div className="w-full py-16 flex flex-col justify-center items-center text-center">
            <p className="shortcut-name text-sm text-foreground">
              {selectedTags.length > 0
                ? "No shortcut carries every selected tag"
                : filter.search
                  ? `No shortcut matches “${filter.search}”`
                  : "No shortcuts yet"}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {selectedTags.length > 0 ? "Clear a tag to widen the search." : "Create one, or press ⌘K to jump to an existing shortcut."}
            </p>
            {selectedTags.length > 0 ? (
              <Button variant="outline" size="sm" className="mt-4 h-8" onClick={() => viewStore.setFilter({ tags: [] })}>
                Clear tags
              </Button>
            ) : (
              !filter.search && (
                <Button size="sm" className="mt-4 h-8" onClick={() => setShowCreateDialog(true)}>
                  <Icon.Plus className="w-4 h-auto" />
                  New shortcut
                </Button>
              )
            )}
          </div>
        ) : (
          <ShortcutsContainer shortcutList={orderedShortcutList} onShortcutClick={handleShortcutClick} />
        )}
      </PageContainer>

      {selectedShortcut && <ShortcutDetailDialog shortcut={selectedShortcut} onClose={() => setSelectedShortcutId(undefined)} />}

      {showCreateDialog && <CreateShortcutDialog onClose={() => setShowCreateDialog(false)} />}
    </>
  );
};

export default ShortcutDashboard;
