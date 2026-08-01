import { uniq } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { normalizeName } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useShortcutStore, useWorkspaceStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

interface Props {
  // The command palette hands over what a Member had already typed.
  initialName?: string;
  onClose: () => void;
  onCreated?: (shortcut: Shortcut) => void;
}

const VISIBILITIES = [Visibility.WORKSPACE, Visibility.PUBLIC];

const FieldLabel = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("font-mono mb-2 text-xs uppercase tracking-[0.1em] text-muted-foreground", className)}>{children}</div>
);

// Creating a Shortcut is really one decision — what to call it — and a handful
// of details. So the Name gets the whole top of the dialog at display size,
// with the collision check next to it, and everything else is secondary. The
// full form, including OpenGraph metadata and the description, stays in the
// drawer, which is still what editing opens.
const CreateShortcutDialog = ({ initialName, onClose, onCreated }: Props) => {
  const { t } = useTranslation();
  const shortcutStore = useShortcutStore();
  const workspaceStore = useWorkspaceStore();
  const [name, setName] = useState<string>(normalizeName(initialName ?? ""));
  const [link, setLink] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState<string>("");
  const [visibility, setVisibility] = useState<Visibility>(
    workspaceStore.setting.defaultVisibility !== Visibility.VISIBILITY_UNSPECIFIED
      ? workspaceStore.setting.defaultVisibility
      : Visibility.WORKSPACE,
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const shortcutList = shortcutStore.getShortcutList();

  useEffect(() => nameRef.current?.focus(), []);

  const takenNames = useMemo(() => new Set(shortcutList.map((shortcut) => shortcut.name)), [shortcutList]);
  const isTaken = Boolean(name) && takenNames.has(name);
  // One alternative rather than a list: a Member either takes it or keeps
  // typing. The server is still the authority — this only saves a round trip.
  const suggestedName = useMemo(() => {
    if (!isTaken) {
      return "";
    }
    for (let suffix = 2; suffix < 100; suffix++) {
      if (!takenNames.has(`${name}${suffix}`)) {
        return `${name}${suffix}`;
      }
    }
    return "";
  }, [isTaken, name, takenNames]);

  const tagSuggestions = useMemo(
    () =>
      uniq(shortcutList.flatMap((shortcut) => shortcut.tags))
        .filter((tag) => !tags.includes(tag))
        .slice(0, 8),
    [shortcutList, tags],
  );

  const canCreate = Boolean(name) && !isTaken && Boolean(link.trim()) && !isSaving;

  const addTag = (value: string) => {
    const tag = normalizeName(value);
    if (!tag) {
      return;
    }
    setTags((current) => (current.includes(tag) ? current : current.concat(tag)));
    setTagDraft("");
  };

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }
    setIsSaving(true);
    try {
      const shortcut = await shortcutStore.createShortcut(
        Shortcut.fromPartial({ name, link: link.trim(), title: title.trim(), tags, visibility }),
      );
      toast.success(`Created s/${shortcut.name}`);
      onCreated?.(shortcut);
      onClose();
    } catch (error: any) {
      toast.error(error.details ?? String(error));
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Hung from the top rather than centred: a form that grows as tags are
          added should not creep up the screen while it is being filled in. */}
      <DialogContent
        className="top-[8vh] translate-y-0 max-w-xl gap-0 p-0 overflow-hidden [&>button]:hidden"
        onKeyDown={handleKeyDown}
        aria-describedby={undefined}
      >
        <div className="flex flex-row items-center gap-2 px-4 py-3 border-b border-border">
          <Icon.Plus className="w-4 h-auto text-muted-foreground" />
          <DialogTitle className="text-base">New shortcut</DialogTitle>
          <DialogDescription className="sr-only">Create a shortcut from a name and a link.</DialogDescription>
          <button
            className="ml-auto w-6 h-6 flex justify-center items-center rounded-sm border border-input text-muted-foreground hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon.X className="w-3.5 h-auto" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-4 py-5 flex flex-col gap-5">
          <div>
            <div className="flex flex-row items-center gap-2 pb-2 border-b border-input">
              <span className="shortcut-name text-2xl text-muted-foreground">s/</span>
              <input
                ref={nameRef}
                className="shortcut-name min-w-0 flex-1 bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/60"
                value={name}
                placeholder="name"
                aria-label="Shortcut name"
                onChange={(e) => setName(normalizeName(e.target.value))}
              />
              {name &&
                (isTaken ? (
                  <span className="font-mono shrink-0 text-xs text-destructive">already taken</span>
                ) : (
                  <span className="font-mono shrink-0 flex flex-row items-center gap-1 text-xs text-muted-foreground">
                    <Icon.Check className="w-3 h-auto" />
                    available
                  </span>
                ))}
            </div>
            {/* Fixed height, so the form does not jump as this line changes. */}
            <div className="mt-2 min-h-5 text-xs text-muted-foreground truncate">
              {isTaken && suggestedName && (
                <span>
                  Try{" "}
                  <button className="shortcut-name text-foreground hover:underline" onClick={() => setName(suggestedName)}>
                    s/{suggestedName}
                  </button>{" "}
                  instead
                </span>
              )}
              {name && !isTaken && (
                <span>
                  Resolves at <span className="shortcut-name text-foreground">{absolutifyLink(`/s/${name}`)}</span>
                </span>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Link</FieldLabel>
            <div className="flex flex-row items-center gap-2 h-10 px-3 rounded-md border border-input bg-background">
              <div className="w-4 h-4 flex justify-center items-center overflow-clip shrink-0">
                <LinkFavicon url={link} />
              </div>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                value={link}
                placeholder="https://grafana.example.com/d/overview"
                aria-label="Link"
                onChange={(e) => setLink(e.target.value)}
              />
              <button
                className="font-mono shrink-0 h-6 px-2 rounded-sm border border-input text-xs uppercase text-muted-foreground hover:text-foreground"
                onClick={async () => setLink(await navigator.clipboard.readText())}
              >
                Paste
              </button>
            </div>
          </div>

          <div>
            <FieldLabel className="mb-2 flex flex-row items-baseline gap-2">
              Title <span className="normal-case tracking-normal text-muted-foreground/70">optional</span>
            </FieldLabel>
            <input
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none placeholder:text-muted-foreground"
              value={title}
              placeholder="What future you will search for"
              aria-label="Title"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Tags</FieldLabel>
            <div className="flex flex-row items-center flex-wrap gap-1.5 min-h-10 px-2 py-1.5 rounded-md border border-input bg-background">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="shortcut-name inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm border border-border bg-muted text-xs text-foreground"
                >
                  <span className="text-muted-foreground">#</span>
                  {tag}
                  <button
                    className="flex text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${tag}`}
                    onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                  >
                    <Icon.X className="w-3 h-auto" />
                  </button>
                </span>
              ))}
              <input
                className="min-w-[7rem] flex-1 h-6 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                value={tagDraft}
                placeholder={tags.length ? "" : "infra, monitoring…"}
                aria-label="Add a tag"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter and comma commit a Tag; backspace on an empty field
                  // eats the last one, which is the only way to fix a typo
                  // without reaching for the mouse.
                  if (e.key === "Enter" || e.key === ",") {
                    if (e.metaKey || e.ctrlKey) {
                      return;
                    }
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === "Backspace" && !tagDraft) {
                    setTags((current) => current.slice(0, -1));
                  }
                }}
              />
            </div>
            {tagSuggestions.length > 0 && (
              <div className="mt-2 flex flex-row items-center flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">Existing</span>
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    className="shortcut-name px-1.5 py-0.5 rounded-sm bg-muted text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => addTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-row items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-muted/40">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{t(`shortcut.visibility.${visibility.toLowerCase()}.self`)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t(`shortcut.visibility.${visibility.toLowerCase()}.description`)}</div>
            </div>
            <div className="shrink-0 flex flex-row gap-0.5 p-0.5 rounded-md border border-input">
              {VISIBILITIES.map((option) => (
                <button
                  key={option}
                  className={cn(
                    "h-6 px-2.5 rounded-sm text-xs transition-colors",
                    option === visibility ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={option === visibility}
                  onClick={() => setVisibility(option)}
                >
                  {t(`shortcut.visibility.${option.toLowerCase()}.self`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center gap-3 px-4 py-3 border-t border-border bg-muted/40">
          <span className="hidden sm:inline text-xs text-muted-foreground">
            <span className="font-mono text-foreground">⌘↵</span> create · <span className="font-mono text-foreground">esc</span> cancel
          </span>
          <div className="ml-auto flex flex-row items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" disabled={!canCreate} onClick={handleCreate}>
              {isSaving ? "Creating…" : "Create shortcut"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShortcutDialog;
