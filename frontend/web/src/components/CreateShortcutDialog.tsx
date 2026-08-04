import { uniq } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { checkName, normalizeName, randomName } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import { useShortcutStore, useWorkspaceStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import { FieldLabel, LinkField, NameField, TagsField, VisibilityField } from "./ShortcutFormFields";

interface Props {
  // The command palette hands over what a Member had already typed.
  initialName?: string;
  onClose: () => void;
  onCreated?: (shortcut: Shortcut) => void;
}

// Creating a Shortcut is really one decision — what to call it — and a handful
// of details. So the Name gets the whole top of the dialog at display size,
// with the collision check next to it, and everything else is secondary. The
// description and the OpenGraph metadata are left to the edit dialog: they are
// written once the Shortcut exists and someone has something to say about it.
const CreateShortcutDialog = ({ initialName, onClose, onCreated }: Props) => {
  const { t } = useTranslation();
  const shortcutStore = useShortcutStore();
  const workspaceStore = useWorkspaceStore();
  const [name, setName] = useState<string>(normalizeName(initialName ?? ""));
  const [link, setLink] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>(
    workspaceStore.setting.defaultVisibility !== Visibility.VISIBILITY_UNSPECIFIED
      ? workspaceStore.setting.defaultVisibility
      : Visibility.WORKSPACE,
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const shortcutList = shortcutStore.getShortcutList();

  useEffect(() => nameRef.current?.focus(), []);

  const { isTaken, suggestion } = useMemo(() => checkName(name, shortcutList), [name, shortcutList]);

  const tagSuggestions = useMemo(
    () =>
      uniq(shortcutList.flatMap((shortcut) => shortcut.tags))
        .filter((tag) => !tags.includes(tag))
        .slice(0, 8),
    [shortcutList, tags],
  );

  const canCreate = Boolean(name) && !isTaken && Boolean(link.trim()) && !isSaving;

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

  // Focus goes back to the field: a generated Name is a starting point, and
  // more often than not the next thing someone does is edit it.
  const handleRandomName = () => {
    setName(randomName(shortcutList));
    nameRef.current?.focus();
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
          <NameField
            value={name}
            isTaken={isTaken}
            inputRef={nameRef}
            onChange={setName}
            action={
              <button
                className="shrink-0 w-7 h-7 flex justify-center items-center rounded-sm border border-input text-muted-foreground hover:text-foreground"
                type="button"
                title="Generate a random name"
                aria-label="Generate a random name"
                onClick={handleRandomName}
              >
                <Icon.Dices className="w-3.5 h-auto" />
              </button>
            }
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
                {name && !isTaken && (
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

          <TagsField tags={tags} suggestions={tagSuggestions} onChange={setTags} />

          <VisibilityField value={visibility} onChange={setVisibility} />
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
