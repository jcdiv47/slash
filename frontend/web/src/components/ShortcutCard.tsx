import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { splitLink } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

interface Props {
  shortcut: Shortcut;
  className?: string;
  onClick?: () => void;
}

// Interactive descendants must not bubble to the card's own onClick, or a click
// on a Tag would both filter the list and open the Shortcut.
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// The `full` Display Style: what the Shortcut is, where it points, and how much
// it is used, in that order. The Name sits in the footer rather than the
// headline, because a titled Shortcut is recognised by its title first — and an
// untitled one says "Untitled" there, which is what makes the gap visible.
const ShortcutCard = ({ shortcut, className, onClick }: Props) => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const { host, path } = splitLink(shortcut.link);

  return (
    <Card
      className={cn(
        "group p-3.5 w-full flex flex-col justify-start items-stretch transition-colors",
        onClick && "cursor-pointer hover:bg-accent/40",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex flex-row justify-between items-start gap-2">
        <div className="min-w-0 flex flex-row items-center gap-2">
          <div className="w-4 h-4 flex justify-center items-center overflow-clip shrink-0">
            <LinkFavicon url={shortcut.link} />
          </div>
          {shortcut.title ? (
            <span className="truncate font-medium tracking-tight text-foreground">{shortcut.title}</span>
          ) : (
            <span className="italic text-muted-foreground">Untitled</span>
          )}
          {shortcut.visibility === Visibility.PUBLIC && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 rounded-sm border border-border text-xs text-muted-foreground">
              <Icon.Globe className="w-3 h-auto" />
              {t("shortcut.visibility.public.self")}
            </span>
          )}
        </div>
        <Icon.ChevronRight className="w-3.5 h-auto shrink-0 text-muted-foreground/60" />
      </div>

      <a
        className="mt-1 w-fit max-w-full truncate text-sm text-muted-foreground hover:underline"
        href={shortcut.link}
        target="_blank"
        onClick={stopPropagation}
      >
        {host}
        {path}
      </a>

      <div className="mt-3.5 pt-2.5 border-t border-border flex flex-row justify-between items-center gap-2">
        <div className="min-w-0 flex flex-row items-center gap-1.5 overflow-hidden">
          <span className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-muted text-xs font-medium text-foreground">
            s/{shortcut.name}
          </span>
          {shortcut.tags.map((tag) => (
            <button
              key={tag}
              className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                stopPropagation(e);
                viewStore.toggleTag(tag);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
        <span className="shortcut-name shrink-0 text-xs text-muted-foreground">{shortcut.viewCount}</span>
      </div>
    </Card>
  );
};

export default ShortcutCard;
