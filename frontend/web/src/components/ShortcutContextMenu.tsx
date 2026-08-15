import copy from "copy-to-clipboard";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useCollectionStore, useShortcutStore, useUserStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import { Role } from "@/types/proto/api/v1/user_service";
import { showCommonDialog } from "./Alert";
import EditShortcutDialog from "./EditShortcutDialog";
import Icon from "./Icon";

interface Props {
  shortcut: Shortcut;
  // Where the right-click happened, in client coordinates.
  x: number;
  y: number;
  onClose: () => void;
}

const EDGE_GAP = 8;

const itemClassName =
  "w-full h-7 px-2 flex flex-row justify-start items-center gap-2.5 rounded-sm text-left text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent";

const Hint = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-auto font-mono text-xs text-muted-foreground">{children}</span>
);

// Everything a Member can do to a Shortcut without leaving the grid. The card
// itself carries only the two actions worth a permanent target — open, and copy
// the Name — so the rest lives here, one right-click away, rather than as a row
// of icons on every card.
const ShortcutContextMenu = ({ shortcut, x, y, onClose }: Props) => {
  const shortcutStore = useShortcutStore();
  const collectionStore = useCollectionStore();
  const currentUser = useUserStore().getCurrentUser();
  const menuRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<"root" | "collections">("root");
  const [showEditDialog, setShowEditDialog] = useState<boolean>(false);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y });
  const havePermission = currentUser.role === Role.ADMIN || shortcut.creatorId === currentUser.id;
  const isPublic = shortcut.visibility === Visibility.PUBLIC;
  const collections = collectionStore.getCollectionList();

  // Measured rather than assumed: the menu grows when it lists Collections, and
  // a menu opened near an edge has to fold back over the pointer either way.
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(y, window.innerHeight - height - EDGE_GAP)),
    });
  }, [x, y, panel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Only fetched when the panel is actually asked for: the dashboard itself has
  // no use for Collections.
  useEffect(() => {
    if (panel === "collections") {
      collectionStore.fetchCollectionList();
    }
  }, [panel]);

  const handleOpenDestination = () => {
    window.open(shortcut.link, "_blank");
    onClose();
  };

  const handleCopyShortLink = () => {
    copy(absolutifyLink(`/s/${shortcut.name}`));
    toast.success("Short link copied to clipboard.");
    onClose();
  };

  const handleToggleVisibility = async () => {
    try {
      await shortcutStore.updateShortcut({ ...shortcut, visibility: isPublic ? Visibility.WORKSPACE : Visibility.PUBLIC }, ["visibility"]);
      toast.success(isPublic ? `s/${shortcut.name} is now workspace-only.` : `s/${shortcut.name} is now public.`);
    } catch (error: any) {
      toast.error(error.details ?? "Could not change visibility.");
    }
    onClose();
  };

  const handleAddToCollection = async (collectionId: number) => {
    const collection = collectionStore.getCollectionById(collectionId);
    try {
      await collectionStore.updateCollection({ ...collection, shortcutIds: [...collection.shortcutIds, shortcut.id] }, ["shortcut_ids"]);
      toast.success(`Added to ${collection.title || `c/${collection.name}`}.`);
    } catch (error: any) {
      toast.error(error.details ?? "Could not add to collection.");
    }
    onClose();
  };

  const handleDelete = () => {
    showCommonDialog({
      title: "Delete Shortcut",
      content: `Are you sure to delete shortcut \`${shortcut.name}\`? You cannot undo this action.`,
      style: "destructive",
      onConfirm: async () => {
        await shortcutStore.deleteShortcut(shortcut.id);
      },
    });
    onClose();
  };

  if (showEditDialog) {
    return <EditShortcutDialog shortcut={shortcut} onClose={onClose} />;
  }

  return (
    // The backdrop closes on either button, so a second right-click dismisses
    // the menu rather than stacking another one behind it.
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="fixed z-50 w-[232px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        style={{ left: position.left, top: position.top }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        {panel === "root" ? (
          <>
            <div className="px-2.5 py-2 flex flex-col gap-0.5 border-b border-border">
              <span className="shortcut-name text-xs font-medium text-foreground">s/{shortcut.name}</span>
              <span className="truncate text-xs text-muted-foreground">{shortcut.link}</span>
            </div>
            <div className="p-1 flex flex-col justify-start items-stretch gap-px">
              <button className={itemClassName} onClick={handleOpenDestination}>
                <Icon.ExternalLink className="w-3.5 h-auto text-muted-foreground" />
                <span>Open destination</span>
                <Hint>↵</Hint>
              </button>
              <button className={itemClassName} onClick={handleCopyShortLink}>
                <Icon.Copy className="w-3.5 h-auto text-muted-foreground" />
                <span>Copy short link</span>
                <Hint>⌘C</Hint>
              </button>
              {havePermission && (
                <button className={itemClassName} onClick={() => setShowEditDialog(true)}>
                  <Icon.Edit className="w-3.5 h-auto text-muted-foreground" />
                  <span>Edit shortcut…</span>
                  <Hint>E</Hint>
                </button>
              )}
              <button className={itemClassName} onClick={() => setPanel("collections")}>
                <Icon.FolderPlus className="w-3.5 h-auto text-muted-foreground" />
                <span>Add to collection…</span>
                <Icon.ChevronRight className="ml-auto w-3.5 h-auto text-muted-foreground" />
              </button>
              {havePermission && (
                <button className={itemClassName} onClick={handleToggleVisibility}>
                  {isPublic ? (
                    <Icon.Lock className="w-3.5 h-auto text-muted-foreground" />
                  ) : (
                    <Icon.Globe className="w-3.5 h-auto text-muted-foreground" />
                  )}
                  <span>{isPublic ? "Restrict to workspace" : "Make public"}</span>
                </button>
              )}
              {havePermission && (
                <>
                  <span className="block h-px my-1 bg-border" />
                  <button className={cn(itemClassName, "text-destructive hover:bg-destructive/10")} onClick={handleDelete}>
                    <Icon.Trash className="w-3.5 h-auto" />
                    <span>Delete shortcut</span>
                    <span className="ml-auto font-mono text-xs text-destructive/60">⌫</span>
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="px-1.5 py-1.5 flex flex-row items-center gap-1 border-b border-border">
              <button
                className="w-6 h-6 flex justify-center items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Back"
                onClick={() => setPanel("root")}
              >
                <Icon.ChevronLeft className="w-3.5 h-auto" />
              </button>
              <span className="text-sm text-foreground">Add to collection</span>
            </div>
            <div className="p-1 max-h-56 overflow-auto flex flex-col justify-start items-stretch gap-px">
              {collections.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No collections yet.</p>
              ) : (
                collections.map((collection) => {
                  const alreadyIn = collection.shortcutIds.includes(shortcut.id);
                  return (
                    <button
                      key={collection.id}
                      className={itemClassName}
                      disabled={alreadyIn}
                      onClick={() => handleAddToCollection(collection.id)}
                    >
                      <span className="shortcut-name shrink-0 text-xs text-muted-foreground">c/{collection.name}</span>
                      <span className="min-w-0 truncate">{collection.title}</span>
                      {alreadyIn && <Icon.Check className="ml-auto w-3.5 h-auto shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShortcutContextMenu;
