import copy from "copy-to-clipboard";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { splitLink } from "@/helpers/shortcut";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Density } from "@/stores/view";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

interface Props {
  shortcut: Shortcut;
  density?: Density;
  // The busiest Shortcut on screen, which the usage bar is drawn against. The
  // bar is comparative only — without a reference it would be decoration.
  maxVisits?: number;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

// Interactive descendants must not bubble to the card's own onClick, or a click
// on a Tag would both filter the list and open the Shortcut.
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// One literal class string per step, because Tailwind only sees static classes.
// Below `sm` every density falls back to the same comfortable card: a phone has
// room for one column whatever the setting says.
const densityClasses: Record<Density, { card: string; title: string; meta: string; footer: string }> = {
  comfortable: { card: "p-3.5", title: "text-base", meta: "text-sm", footer: "mt-3.5 pt-2.5" },
  compact: { card: "p-3.5 sm:px-3 sm:py-2.5", title: "text-base sm:text-sm", meta: "text-sm sm:text-[13px]", footer: "mt-3 pt-2" },
  dense: { card: "p-3.5 sm:px-2.5 sm:py-2", title: "text-base sm:text-[13px]", meta: "text-sm sm:text-xs", footer: "mt-2.5 pt-1.5" },
};

const COPIED_FOR_MS = 1400;

// The `full` Display Style: what the Shortcut is, where it points, and how much
// it is used, in that order. The Name sits in the footer rather than the
// headline, because a titled Shortcut is recognised by its title first — and an
// untitled one says "Untitled" there, which is what makes the gap visible. The
// Name is also the one thing a Member copies, so it doubles as the copy button.
const ShortcutCard = ({ shortcut, density = "comfortable", maxVisits = 0, className, onClick, onContextMenu }: Props) => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const { host, path } = splitLink(shortcut.link);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const step = densityClasses[density];
  // A share of the busiest Shortcut, floored so a Shortcut with one visit still
  // draws something. Zero visits draws nothing at all.
  const usage = maxVisits > 0 && shortcut.viewCount > 0 ? Math.max(4, Math.round((shortcut.viewCount / maxVisits) * 100)) : 0;

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopyClick = (e: React.MouseEvent) => {
    stopPropagation(e);
    copy(absolutifyLink(`/s/${shortcut.name}`));
    setIsCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setIsCopied(false), COPIED_FOR_MS);
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden w-full flex flex-col justify-start items-stretch transition-colors",
        step.card,
        onClick && "cursor-pointer hover:bg-accent/40",
        className,
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex flex-row justify-between items-center gap-2">
        <div className="min-w-0 flex flex-row items-center gap-2">
          <div className="w-4 h-4 flex justify-center items-center overflow-clip shrink-0">
            <LinkFavicon url={shortcut.link} />
          </div>
          {shortcut.title ? (
            <span className={cn("truncate font-medium tracking-tight text-foreground", step.title)}>{shortcut.title}</span>
          ) : (
            <span className={cn("italic text-muted-foreground", step.title)}>Untitled</span>
          )}
        </div>
        {shortcut.visibility === Visibility.PUBLIC && (
          <span className="shrink-0 text-muted-foreground" title={t("shortcut.visibility.public.self")}>
            <Icon.Globe className="w-3 h-auto" />
          </span>
        )}
      </div>

      <a
        className={cn("mt-1 w-fit max-w-full truncate text-muted-foreground hover:underline", step.meta)}
        href={shortcut.link}
        target="_blank"
        onClick={stopPropagation}
      >
        {host}
        {path}
      </a>

      <div className={cn("flex flex-row justify-between items-center gap-2 border-t border-border", step.footer)}>
        <button
          className={cn(
            "shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm text-xs font-medium transition-colors",
            isCopied ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-secondary",
          )}
          aria-label={`Copy s/${shortcut.name}`}
          onClick={handleCopyClick}
        >
          {isCopied ? "copied" : `s/${shortcut.name}`}
        </button>
        <div className="min-w-0 flex flex-row items-center gap-1 overflow-hidden">
          {shortcut.tags.map((tag) => (
            <button
              key={tag}
              className="shortcut-name shrink-0 px-1 rounded-sm text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
              onClick={(e) => {
                stopPropagation(e);
                viewStore.toggleTag(tag);
              }}
            >
              {tag}
            </button>
          ))}
          <a
            className="shrink-0 w-5 h-5 flex justify-center items-center rounded-sm text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
            href={`/s/${shortcut.name}`}
            target="_blank"
            aria-label={`Open s/${shortcut.name}`}
            onClick={stopPropagation}
          >
            <Icon.ArrowUpRight className="w-3.5 h-auto" />
          </a>
        </div>
      </div>

      {/* Usage, as a hairline the width of this Shortcut's share of the busiest
          one. A number in the footer would compete with the Name; a rule at the
          very bottom edge only reads when cards are compared. */}
      {usage > 0 && <span className="absolute left-0 bottom-0 h-0.5 bg-primary/60" style={{ width: `${usage}%` }} />}
    </Card>
  );
};

export default ShortcutCard;
