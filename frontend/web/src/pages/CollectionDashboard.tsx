import copy from "copy-to-clipboard";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { toast } from "sonner";
import { showCommonDialog } from "@/components/Alert";
import CreateCollectionDrawer from "@/components/CreateCollectionDrawer";
import Icon from "@/components/Icon";
import LinkFavicon from "@/components/LinkFavicon";
import PageContainer from "@/components/PageContainer";
import Dropdown from "@/components/common/Dropdown";
import { Button } from "@/components/ui/button";
import { formatCount, splitLink } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import useLoading from "@/hooks/useLoading";
import useNavigateTo from "@/hooks/useNavigateTo";
import { cn } from "@/lib/utils";
import { useCollectionStore, useShortcutStore, useUserStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";

// The rows of a Collection align to each other the way Shortcut Rows do: fixed
// or `fr` tracks only, in one literal string Tailwind can see. Below `md` the
// Link and the visit count are the context that goes; the Name stays.
const ROW_COLUMNS =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] md:grid-cols-[1.25rem_minmax(0,10rem)_minmax(0,1fr)_minmax(0,12rem)_4.5rem_1rem] items-center gap-3.5";

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// Collections are an index, not a stack of cards: the rail lists them all and
// the pane shows what is in the one selected. A card per Collection answered
// "what Collections exist" twice over and "what is in this one" never, and it
// stopped fitting the page at four.
const CollectionDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [, setLastVisited] = useLocalStorage<string>("lastVisited", "/shortcuts");
  const loadingState = useLoading();
  const navigateTo = useNavigateTo();
  const shortcutStore = useShortcutStore();
  const collectionStore = useCollectionStore();
  const currentUser = useUserStore().getCurrentUser();
  const [showCreateDrawer, setShowCreateDrawer] = useState<boolean>(false);
  const [editingCollectionId, setEditingCollectionId] = useState<number | undefined>(undefined);
  const [selectedName, setSelectedName] = useState<string>("");
  const collections = collectionStore.getCollectionList();
  const shortcutList = shortcutStore.getShortcutList();
  // Resolved by name rather than held as an object, so an edit or a delete lands
  // in the pane without a second source of truth.
  const selectedCollection = collections.find((collection) => collection.name === selectedName) ?? collections[0];
  const editingCollection = collections.find((collection) => collection.id === editingCollectionId);

  useEffect(() => {
    setLastVisited("/collections");
    Promise.all([shortcutStore.fetchShortcutList(), collectionStore.fetchCollectionList()]).finally(() => {
      loadingState.setFinish();
    });
  }, []);

  const shortcutsOf = (shortcutIds: number[]): Shortcut[] =>
    shortcutIds.map((shortcutId) => shortcutList.find((shortcut) => shortcut.id === shortcutId)).filter(Boolean) as Shortcut[];

  const selectedShortcuts = selectedCollection ? shortcutsOf(selectedCollection.shortcutIds) : [];
  const canEditSelected = selectedCollection?.creatorId === currentUser.id;

  const handleCopyCollectionLink = (name: string) => {
    copy(absolutifyLink(`/c/${name}`));
    toast.success("Collection link copied to clipboard.");
  };

  const handleOpenAll = () => {
    selectedShortcuts.forEach((shortcut) => window.open(`/s/${shortcut.name}`));
  };

  const handleDeleteSelected = () => {
    if (!selectedCollection) {
      return;
    }
    showCommonDialog({
      title: "Delete Collection",
      content: `Are you sure to delete collection \`${selectedCollection.name}\`? You cannot undo this action.`,
      style: "destructive",
      onConfirm: async () => {
        await collectionStore.deleteCollection(selectedCollection.id);
        setSelectedName("");
      },
    });
  };

  if (loadingState.isLoading) {
    return null;
  }

  if (collections.length === 0) {
    return (
      <>
        <PageContainer className="pt-6 pb-16">
          <div className="py-16 w-full flex flex-col justify-center items-center text-center text-muted-foreground">
            <Icon.PackageOpen size={56} strokeWidth={1} />
            <p className="mt-3 text-sm text-foreground">No collections yet</p>
            <p className="mt-1.5 text-sm">A Collection is a set of Shortcuts that gets one link.</p>
            <Button size="sm" className="mt-4 h-8" onClick={() => setShowCreateDrawer(true)}>
              <Icon.Plus className="w-4 h-auto" />
              New collection
            </Button>
            <a
              className="mt-6 pt-2 border-t border-border text-sm text-foreground hover:underline flex flex-row justify-center items-center"
              href="https://github.com/yourselfhosted/slash/blob/main/docs/getting-started/collections.md"
              target="_blank"
            >
              <span>Learn more about collections.</span>
              <Icon.ExternalLink className="ml-1 w-4 h-auto inline" />
            </a>
          </div>
        </PageContainer>

        {showCreateDrawer && (
          <CreateCollectionDrawer onClose={() => setShowCreateDrawer(false)} onConfirm={() => setShowCreateDrawer(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <PageContainer className="pt-6 pb-16">
        <div className="w-full grid grid-cols-1 md:grid-cols-[16.5rem_minmax(0,1fr)]">
          <div className="flex flex-col justify-start items-stretch gap-0.5 pb-4 border-b border-border md:pb-0 md:pr-4 md:border-b-0 md:border-r">
            <div className="px-3 pb-2.5 flex flex-row justify-between items-baseline">
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">collections</span>
              <span className="shortcut-name text-xs text-muted-foreground">{collections.length}</span>
            </div>
            {collections.map((collection) => {
              const isSelected = collection.id === selectedCollection?.id;
              return (
                <button
                  key={collection.id}
                  className={cn(
                    "w-full px-3 py-2.5 flex flex-col justify-start items-start gap-0.5 text-left border-l-2 transition-colors",
                    isSelected ? "border-primary bg-accent/40" : "border-transparent hover:bg-accent/30",
                  )}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedName(collection.name)}
                >
                  <span className="shortcut-name max-w-full truncate text-sm font-medium text-foreground">c/{collection.name}</span>
                  <span className="max-w-full truncate text-sm text-muted-foreground">{collection.title}</span>
                  <span className="shortcut-name text-xs text-muted-foreground/80">{collection.shortcutIds.length} shortcuts</span>
                </button>
              );
            })}
            <button
              className="mt-2 w-full px-3 py-2 flex flex-row justify-start items-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-input transition-colors"
              onClick={() => setShowCreateDrawer(true)}
            >
              <Icon.Plus className="w-3.5 h-auto" />
              New collection
            </button>
          </div>

          {selectedCollection && (
            <div className="pt-4 md:pt-0 md:pl-6 flex flex-col justify-start items-stretch">
              <div className="pb-3.5 flex flex-row justify-between items-start gap-4 border-b border-border">
                <div className="min-w-0">
                  <div className="flex flex-row items-baseline gap-2.5">
                    <h1 className="text-base font-semibold tracking-tight">{selectedCollection.title}</h1>
                    <button
                      className="shortcut-name text-sm text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Copy collection link"
                      onClick={() => handleCopyCollectionLink(selectedCollection.name)}
                    >
                      c/{selectedCollection.name}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedCollection.description || <span className="italic">No description</span>}
                  </p>
                </div>
                <div className="shrink-0 flex flex-row justify-end items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 px-2.5" asChild>
                    <Link to={`/c/${selectedCollection.name}`} target="_blank">
                      <Icon.Share className="w-3.5 h-auto" />
                      <span className="hidden md:inline">Share</span>
                    </Link>
                  </Button>
                  <Button size="sm" className="h-8 px-2.5" disabled={selectedShortcuts.length === 0} onClick={handleOpenAll}>
                    <Icon.ArrowUpRight className="w-3.5 h-auto" />
                    <span className="hidden md:inline">Open all</span>
                  </Button>
                  {canEditSelected && (
                    <Dropdown
                      trigger={
                        <button className="w-7 h-7 flex flex-row justify-center items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                          <Icon.MoreVertical className="w-4 h-auto" />
                        </button>
                      }
                      actionsClassName="!w-28 text-sm"
                      actions={
                        <>
                          <button
                            className="w-full px-2 flex flex-row justify-start items-center text-left text-foreground leading-8 cursor-pointer rounded hover:bg-accent"
                            onClick={() => setEditingCollectionId(selectedCollection.id)}
                          >
                            <Icon.Edit className="w-4 h-auto mr-2 opacity-70" /> {t("common.edit")}
                          </button>
                          <button
                            className="w-full px-2 flex flex-row justify-start items-center text-left text-destructive leading-8 cursor-pointer rounded hover:bg-accent"
                            onClick={handleDeleteSelected}
                          >
                            <Icon.Trash className="w-4 h-auto mr-2 opacity-70" /> {t("common.delete")}
                          </button>
                        </>
                      }
                    ></Dropdown>
                  )}
                </div>
              </div>

              {selectedShortcuts.length === 0 ? (
                <div className="w-full py-14 flex flex-col justify-center items-center text-center">
                  <p className="shortcut-name text-sm text-foreground">Nothing in c/{selectedCollection.name} yet</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Right-click a shortcut on the dashboard to add it, or edit the collection.
                  </p>
                </div>
              ) : (
                <div className="w-full flex flex-col justify-start items-stretch">
                  {selectedShortcuts.map((shortcut) => {
                    const { host, path } = splitLink(shortcut.link);
                    return (
                      <div
                        key={shortcut.id}
                        className={cn(
                          ROW_COLUMNS,
                          "w-full px-2.5 py-2 border-b border-border cursor-pointer transition-colors hover:bg-accent/40",
                        )}
                        onClick={() => navigateTo(`/shortcut/${shortcut.id}`)}
                      >
                        <div className="w-5 h-5 flex justify-center items-center overflow-clip shrink-0">
                          <LinkFavicon url={shortcut.link} />
                        </div>
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
                        <span className="shortcut-name text-right text-[13px] text-muted-foreground">
                          {formatCount(shortcut.viewCount)}
                        </span>
                        <span className="hidden md:flex flex-row justify-end items-center text-muted-foreground/50">
                          <Icon.ChevronRight className="w-3.5 h-auto" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </PageContainer>

      {showCreateDrawer && (
        <CreateCollectionDrawer onClose={() => setShowCreateDrawer(false)} onConfirm={() => setShowCreateDrawer(false)} />
      )}

      {editingCollection && (
        <CreateCollectionDrawer
          collectionId={editingCollection.id}
          onClose={() => setEditingCollectionId(undefined)}
          onConfirm={() => setEditingCollectionId(undefined)}
        />
      )}
    </>
  );
};

export default CollectionDashboard;
