import copy from "copy-to-clipboard";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { normalizeName } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import useNavigateTo from "@/hooks/useNavigateTo";
import { useCollectionStore, useShortcutStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import CreateShortcutDialog from "./CreateShortcutDialog";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

// cmdk matches on an item's `value`, so it must be unique — two shortcuts with
// the same title would otherwise collapse into a single item. The id is encoded
// into the value so the highlighted item can be resolved back to a shortcut.
const shortcutItemValue = (shortcut: Shortcut) => `shortcut-${shortcut.id}-${shortcut.name}-${shortcut.title}-${shortcut.link}`;

const shortcutIdFromValue = (value: string) => {
  // cmdk lowercases the values it reports back, which the digits survive.
  const matches = value.match(/^shortcut-(\d+)-/);
  return matches ? Number(matches[1]) : undefined;
};

// The palette is mounted once for the whole app and owns its own open state, so
// the header's ⌘K button asks for it through an event rather than by lifting
// that state into every route that renders a header.
const OPEN_EVENT = "slash:open-command-palette";

export const openCommandPalette = () => document.dispatchEvent(new CustomEvent(OPEN_EVENT));

// The palette is mounted once for the whole app, so it cannot rely on a page
// having already loaded the lists it searches over.
const CommandPalette = () => {
  const navigateTo = useNavigateTo();
  const shortcutStore = useShortcutStore();
  const collectionStore = useCollectionStore();
  const [open, setOpen] = useState<boolean>(false);
  const [value, setValue] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [createName, setCreateName] = useState<string | undefined>(undefined);
  const shortcutList = shortcutStore.getShortcutList();
  const collectionList = collectionStore.getCollectionList();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    const handleOpen = () => setOpen(true);

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener(OPEN_EVENT, handleOpen);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener(OPEN_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    // The dialog unmounts its content on close but this state outlives it, so
    // without a reset the palette would reopen on the previous selection.
    setValue("");
    setSearch("");
    // Refetched on each open rather than on mount so the palette reflects
    // shortcuts created elsewhere in the session.
    Promise.all([shortcutStore.fetchShortcutList(), collectionStore.fetchCollectionList()]);
  }, [open]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  const copyShortcutLink = (shortcut: Shortcut) => {
    copy(absolutifyLink(`/s/${shortcut.name}`));
    toast.success("Shortcut link copied to clipboard.");
  };

  // Copying is a modifier on the highlighted item rather than its own group, so
  // that every shortcut does not appear twice in the result list.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) {
      return;
    }
    const shortcutId = shortcutIdFromValue(value);
    const shortcut = shortcutList.find((shortcut) => shortcut.id === shortcutId);
    if (!shortcut) {
      return;
    }
    e.preventDefault();
    runCommand(() => copyShortcutLink(shortcut));
  };

  const proposedName = normalizeName(search);
  // Offered only when nothing already answers to that Name, so the row never
  // competes with the Shortcut a Member was actually looking for.
  const canCreateProposedName = Boolean(proposedName) && !shortcutList.some((shortcut) => shortcut.name === proposedName);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        description="Search shortcuts and collections, or jump to a page."
        commandProps={{ value, onValueChange: setValue, onKeyDown: handleKeyDown }}
      >
        <CommandInput value={search} onValueChange={setSearch} placeholder="Search shortcuts, collections, commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {/* cmdk hides empty groups while filtering, but not a group that never
            had items — so an empty list would leave a stray heading behind. */}
          {shortcutList.length > 0 && (
            <>
              <CommandGroup heading="Shortcuts">
                {shortcutList.map((shortcut) => (
                  <CommandItem
                    key={shortcut.id}
                    value={shortcutItemValue(shortcut)}
                    className="cursor-pointer gap-2"
                    onSelect={() => runCommand(() => window.open(absolutifyLink(`/s/${shortcut.name}`)))}
                  >
                    <div className="w-4 h-4 flex justify-center items-center overflow-clip shrink-0">
                      <LinkFavicon url={shortcut.link} />
                    </div>
                    <span className="truncate">{shortcut.title || `s/${shortcut.name}`}</span>
                    {shortcut.title && <span className="shortcut-name text-muted-foreground shrink-0">s/{shortcut.name}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {collectionList.length > 0 && (
            <>
              <CommandGroup heading="Collections">
                {collectionList.map((collection) => (
                  <CommandItem
                    key={collection.id}
                    value={`collection-${collection.id}-${collection.name}-${collection.title}`}
                    className="cursor-pointer gap-2"
                    onSelect={() => runCommand(() => navigateTo(`/c/${collection.name}`))}
                  >
                    <Icon.LibrarySquare className="w-4 h-auto shrink-0 text-muted-foreground" />
                    <span className="truncate">{collection.title || `c/${collection.name}`}</span>
                    {collection.title && <span className="shortcut-name text-muted-foreground shrink-0">c/{collection.name}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Go to">
            <CommandItem className="cursor-pointer gap-2" onSelect={() => runCommand(() => navigateTo("/shortcuts"))}>
              <Icon.SquareSlash className="w-4 h-auto shrink-0 text-muted-foreground" />
              Shortcuts
            </CommandItem>
            <CommandItem className="cursor-pointer gap-2" onSelect={() => runCommand(() => navigateTo("/collections"))}>
              <Icon.LibrarySquare className="w-4 h-auto shrink-0 text-muted-foreground" />
              Collections
            </CommandItem>
            <CommandItem className="cursor-pointer gap-2" onSelect={() => runCommand(() => navigateTo("/setting/general"))}>
              <Icon.User className="w-4 h-auto shrink-0 text-muted-foreground" />
              Settings
            </CommandItem>
          </CommandGroup>
          {/* Last, not first: cmdk highlights the top item, and creating must
              never be what ↵ does while a Member is looking for something that
              already exists. */}
          {canCreateProposedName && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Create">
                <CommandItem
                  value={`create-${search}`}
                  className="cursor-pointer gap-2"
                  onSelect={() => runCommand(() => setCreateName(proposedName))}
                >
                  <Icon.Plus className="w-4 h-auto shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    New shortcut <span className="shortcut-name text-muted-foreground">s/{proposedName}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="flex flex-row justify-end items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            <CommandShortcut className="ml-0 mr-1 text-foreground">↵</CommandShortcut>open
          </span>
          <span>
            <CommandShortcut className="ml-0 mr-1 text-foreground">⌘↵</CommandShortcut>copy link
          </span>
        </div>
      </CommandDialog>

      {createName !== undefined && <CreateShortcutDialog initialName={createName} onClose={() => setCreateName(undefined)} />}
    </>
  );
};

export default CommandPalette;
