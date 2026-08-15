import { uniq } from "lodash-es";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { checkName } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useShortcutStore } from "@/stores";
import { getShortcutUpdateMask } from "@/stores/shortcut";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut, Shortcut_OpenGraphMetadata } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import { FieldLabel, LinkField, NameField, TagsField, VisibilityField } from "./ShortcutFormFields";

interface Props {
  shortcut: Shortcut;
  onClose: () => void;
  onSaved?: (shortcut: Shortcut) => void;
}

const EMPTY_OG_METADATA: Shortcut_OpenGraphMetadata = { title: "", description: "", image: "" };

const isEmptyOgMetadata = (metadata: Shortcut_OpenGraphMetadata) => !metadata.title && !metadata.description && !metadata.image;

// Editing is the other half of creating: the same fields, plus the two that
// only make sense once the Shortcut exists — the description, and the
// OpenGraph metadata that decides how it unfurls when it is pasted somewhere.
// It is a dialog rather than a drawer so it sits over the Shortcut it is
// editing, the way the detail dialog it is usually opened from does.
const EditShortcutDialog = ({ shortcut, onClose, onSaved }: Props) => {
  const { t } = useTranslation();
  const shortcutStore = useShortcutStore();
  const [name, setName] = useState<string>(shortcut.name);
  const [link, setLink] = useState<string>(shortcut.link);
  const [title, setTitle] = useState<string>(shortcut.title);
  const [description, setDescription] = useState<string>(shortcut.description);
  const [tags, setTags] = useState<string[]>(shortcut.tags);
  const [visibility, setVisibility] = useState<Visibility>(shortcut.visibility);
  const [ogMetadata, setOgMetadata] = useState<Shortcut_OpenGraphMetadata>(shortcut.ogMetadata ?? EMPTY_OG_METADATA);
  // Open when there is already something to see, so metadata that exists is
  // never hidden behind a disclosure a Member has to think to open.
  const [showOgMetadata, setShowOgMetadata] = useState<boolean>(!isEmptyOgMetadata(shortcut.ogMetadata ?? EMPTY_OG_METADATA));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const shortcutList = shortcutStore.getShortcutList();

  // A Shortcut does not collide with its own Name.
  const { isTaken, suggestion } = useMemo(() => checkName(name, shortcutList, shortcut.id), [name, shortcutList, shortcut.id]);

  const tagSuggestions = useMemo(
    () =>
      uniq(shortcutList.flatMap((s) => s.tags))
        .filter((tag) => !tags.includes(tag))
        .slice(0, 8),
    [shortcutList, tags],
  );

  const updating = useMemo(
    () =>
      Shortcut.fromPartial({
        ...shortcut,
        name,
        link: link.trim(),
        title: title.trim(),
        description: description.trim(),
        tags,
        visibility,
        // A Shortcut that never had metadata and still has none is unchanged,
        // rather than gaining three empty strings.
        ogMetadata: !shortcut.ogMetadata && isEmptyOgMetadata(ogMetadata) ? undefined : ogMetadata,
      }),
    [shortcut, name, link, title, description, tags, visibility, ogMetadata],
  );
  const updateMask = useMemo(() => getShortcutUpdateMask(shortcut, updating), [shortcut, updating]);

  const isRenaming = name !== shortcut.name;
  const canSave = Boolean(name) && !isTaken && Boolean(link.trim()) && updateMask.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await shortcutStore.updateShortcut(updating, updateMask);
      toast.success(`Saved s/${saved.name}`);
      onSaved?.(saved);
      onClose();
    } catch (error: any) {
      toast.error(error.details ?? String(error));
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="top-[8vh] translate-y-0 max-w-xl max-h-[84vh] flex flex-col gap-0 p-0 overflow-hidden [&>button]:hidden"
        onKeyDown={handleKeyDown}
        aria-describedby={undefined}
      >
        <div className="shrink-0 flex flex-row items-center gap-2 px-4 py-3 border-b border-border">
          <Icon.Edit className="w-4 h-auto text-muted-foreground" />
          <DialogTitle className="text-base">Edit shortcut</DialogTitle>
          <DialogDescription className="sr-only">Edit this shortcut&apos;s name, link and details.</DialogDescription>
          <button
            className="ml-auto w-6 h-6 flex justify-center items-center rounded-sm border border-input text-muted-foreground hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon.X className="w-3.5 h-auto" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 flex flex-col gap-5">
          <NameField
            value={name}
            isTaken={isTaken}
            onChange={setName}
            hint={
              <>
                {isTaken && suggestion && (
                  <span>
                    Try{" "}
                    <button className="shortcut-name text-foreground hover:underline" onClick={() => setName(suggestion)}>
                      s/{suggestion}
                    </button>{" "}
                    instead
                  </span>
                )}
                {/* Renaming is the one edit that breaks something already in
                    the world: every link anyone has pasted points at the old
                    Name. Say so before it is saved, not after. */}
                {!isTaken && isRenaming && (
                  <span className="text-destructive">
                    <span className="shortcut-name">s/{shortcut.name}</span> will stop resolving
                  </span>
                )}
                {!isTaken && !isRenaming && (
                  <span>
                    Resolves at <span className="shortcut-name text-foreground">{absolutifyLink(`/s/${name}`)}</span>
                  </span>
                )}
              </>
            }
          />

          <LinkField value={link} onChange={setLink} />

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
            <FieldLabel className="mb-2 flex flex-row items-baseline gap-2">
              Description <span className="normal-case tracking-normal text-muted-foreground/70">optional</span>
            </FieldLabel>
            <textarea
              className="w-full min-h-20 px-3 py-2 rounded-md border border-input bg-background text-sm leading-6 outline-none resize-y placeholder:text-muted-foreground"
              value={description}
              rows={3}
              placeholder="Why this exists, so future you remembers"
              aria-label="Description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <TagsField tags={tags} suggestions={tagSuggestions} onChange={setTags} />

          <VisibilityField value={visibility} onChange={setVisibility} />

          {/* Metadata is what the Link looks like when it is pasted into a chat.
              It is folded away, because most Shortcuts never need it. */}
          <div className="rounded-md border border-border overflow-hidden">
            <button
              className={cn(
                "w-full flex flex-row items-center gap-2 px-3 py-2.5 text-left hover:bg-accent transition-colors",
                showOgMetadata && "border-b border-border bg-muted/40",
              )}
              aria-expanded={showOgMetadata}
              onClick={() => setShowOgMetadata(!showOgMetadata)}
            >
              <Icon.Share2 className="w-4 h-auto text-muted-foreground" />
              <span className="text-sm text-foreground">Social media metadata</span>
              <Icon.ChevronDown
                className={cn("ml-auto w-4 h-auto text-muted-foreground transition-transform", showOgMetadata && "rotate-180")}
              />
            </button>
            {showOgMetadata && (
              <div className="px-3 py-4 flex flex-col gap-4">
                <div>
                  <FieldLabel>Image URL</FieldLabel>
                  <input
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none placeholder:text-muted-foreground"
                    value={ogMetadata.image}
                    placeholder="https://the.link.to/the/image.png"
                    aria-label="Metadata image URL"
                    onChange={(e) => setOgMetadata({ ...ogMetadata, image: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel>Title</FieldLabel>
                  <input
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none placeholder:text-muted-foreground"
                    value={ogMetadata.title}
                    placeholder="Slash - An open source, self-hosted platform"
                    aria-label="Metadata title"
                    onChange={(e) => setOgMetadata({ ...ogMetadata, title: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    className="w-full min-h-20 px-3 py-2 rounded-md border border-input bg-background text-sm leading-6 outline-none resize-y placeholder:text-muted-foreground"
                    value={ogMetadata.description}
                    rows={3}
                    placeholder="An open source, self-hosted platform for sharing and managing your most frequently used links."
                    aria-label="Metadata description"
                    onChange={(e) => setOgMetadata({ ...ogMetadata, description: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-row items-center gap-3 px-4 py-3 border-t border-border bg-muted/40">
          <span className="hidden sm:inline text-xs text-muted-foreground">
            <span className="font-mono text-foreground">⌘↵</span> save · <span className="font-mono text-foreground">esc</span> cancel
          </span>
          <div className="ml-auto flex flex-row items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" disabled={!canSave} onClick={handleSave}>
              {isSaving ? "Saving…" : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditShortcutDialog;
