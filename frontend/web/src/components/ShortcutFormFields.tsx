import { useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeName } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { Visibility } from "@/types/proto/api/v1/common";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

// The fields a Shortcut is made of, shared by the dialog that creates one and
// the dialog that edits one. They differ in what they lead with and what they
// do on save, not in how a Link or a Tag is typed.

export const FieldLabel = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("font-mono mb-2 text-xs uppercase tracking-[0.1em] text-muted-foreground", className)}>{children}</div>
);

interface NameFieldProps {
  value: string;
  isTaken: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange: (name: string) => void;
  // The line under the field, kept at a fixed height by the caller's content or
  // not, so the form does not jump as it changes.
  hint?: React.ReactNode;
  // Sits on the Name line, after the availability marker. Only the create
  // dialog has anything to put here: renaming an existing Shortcut at random
  // would break the links pointing at it.
  action?: React.ReactNode;
}

// The Name gets display size in both dialogs: it is the decision being made
// when creating, and the thing links depend on when editing.
export const NameField = ({ value, isTaken, inputRef, onChange, hint, action }: NameFieldProps) => (
  <div>
    <div className="flex flex-row items-center gap-2 pb-2 border-b border-input">
      <span className="shortcut-name text-2xl text-muted-foreground">s/</span>
      <input
        ref={inputRef}
        className="shortcut-name min-w-0 flex-1 bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/60"
        value={value}
        placeholder="name"
        aria-label="Shortcut name"
        onChange={(e) => onChange(normalizeName(e.target.value))}
      />
      {value &&
        (isTaken ? (
          <span className="font-mono shrink-0 text-xs text-destructive">already taken</span>
        ) : (
          <span className="font-mono shrink-0 flex flex-row items-center gap-1 text-xs text-muted-foreground">
            <Icon.Check className="w-3 h-auto" />
            available
          </span>
        ))}
      {action}
    </div>
    <div className="mt-2 min-h-5 text-xs text-muted-foreground truncate">{hint}</div>
  </div>
);

export const LinkField = ({ value, onChange }: { value: string; onChange: (link: string) => void }) => (
  <div>
    <FieldLabel>Link</FieldLabel>
    <div className="flex flex-row items-center gap-2 h-10 px-3 rounded-md border border-input bg-background">
      <div className="w-4 h-4 flex justify-center items-center overflow-clip shrink-0">
        <LinkFavicon url={value} />
      </div>
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={value}
        placeholder="https://grafana.example.com/d/overview"
        aria-label="Link"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="font-mono shrink-0 h-6 px-2 rounded-sm border border-input text-xs uppercase text-muted-foreground hover:text-foreground"
        onClick={async () => onChange(await navigator.clipboard.readText())}
      >
        Paste
      </button>
    </div>
  </div>
);

interface TagsFieldProps {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export const TagsField = ({ tags, suggestions, onChange }: TagsFieldProps) => {
  const [draft, setDraft] = useState<string>("");

  const addTag = (value: string) => {
    const tag = normalizeName(value);
    if (!tag) {
      return;
    }
    if (!tags.includes(tag)) {
      onChange(tags.concat(tag));
    }
    setDraft("");
  };

  return (
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
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <Icon.X className="w-3 h-auto" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[7rem] flex-1 h-6 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={draft}
          placeholder={tags.length ? "" : "infra, monitoring…"}
          aria-label="Add a tag"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter and comma commit a Tag; backspace on an empty field eats the
            // last one, which is the only way to fix a typo without reaching for
            // the mouse. ⌘↵ belongs to the dialog, so it passes through.
            if (e.key === "Enter" || e.key === ",") {
              if (e.metaKey || e.ctrlKey) {
                return;
              }
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && !draft) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-row items-center flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Existing</span>
          {suggestions.map((tag) => (
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
  );
};

const VISIBILITIES = [Visibility.WORKSPACE, Visibility.PUBLIC];

export const VisibilityField = ({ value, onChange }: { value: Visibility; onChange: (visibility: Visibility) => void }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-row items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-muted/40">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{t(`shortcut.visibility.${value.toLowerCase()}.self`)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{t(`shortcut.visibility.${value.toLowerCase()}.description`)}</div>
      </div>
      <div className="shrink-0 flex flex-row gap-0.5 p-0.5 rounded-md border border-input">
        {VISIBILITIES.map((option) => (
          <button
            key={option}
            className={cn(
              "h-6 px-2.5 rounded-sm text-xs transition-colors",
              option === value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {t(`shortcut.visibility.${option.toLowerCase()}.self`)}
          </button>
        ))}
      </div>
    </div>
  );
};
