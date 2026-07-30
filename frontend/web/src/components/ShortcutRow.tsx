import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";
import ShortcutActionsDropdown from "./ShortcutActionsDropdown";
import VisibilityIcon from "./VisibilityIcon";

// Every row shares this template so the columns line up down the list. Each row
// is its own grid container, so alignment holds only because every track is
// fixed or `fr` — both resolve against the row's width, which is identical for
// all rows. Never switch a track to `auto` or `min-content`: those size to each
// row's own content, and the columns immediately stop lining up. It also has to
// be one literal string, since Tailwind only sees static classes.
export const SHORTCUT_ROW_COLUMNS = "grid grid-cols-[1.25rem_minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)_3.5rem_1.5rem] items-center gap-3";

interface Props {
  shortcut: Shortcut;
  showActions?: boolean;
  onClick?: () => void;
}

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

const ShortcutRow = (props: Props) => {
  const { shortcut, showActions, onClick } = props;
  const { t } = useTranslation();
  const viewStore = useViewStore();

  return (
    <div
      className={cn(SHORTCUT_ROW_COLUMNS, "group w-full px-2 py-2 transition-colors", onClick && "cursor-pointer hover:bg-accent/50")}
      onClick={onClick}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-5 h-5 flex justify-center items-center overflow-clip shrink-0">
            <LinkFavicon url={shortcut.link} />
          </div>
        </TooltipTrigger>
        <TooltipContent className="flex flex-row items-center gap-1">
          <VisibilityIcon className="w-4 h-auto" visibility={shortcut.visibility} />
          {t(`shortcut.visibility.${shortcut.visibility.toLowerCase()}.self`)}
        </TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex flex-col justify-center leading-tight">
        {shortcut.title && <span className="truncate text-foreground font-medium">{shortcut.title}</span>}
        <a
          className="shortcut-name w-fit max-w-full truncate text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
          href={`/s/${shortcut.name}`}
          target="_blank"
          onClick={stopPropagation}
        >
          s/{shortcut.name}
        </a>
      </div>

      <a
        className="min-w-0 truncate text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
        href={shortcut.link}
        target="_blank"
        onClick={stopPropagation}
      >
        {shortcut.link}
      </a>

      <div className="min-w-0 flex flex-row justify-start items-center gap-1.5 overflow-hidden">
        {shortcut.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="max-w-[7rem] truncate cursor-pointer hover:bg-secondary/80 transition-colors"
            onClick={(e) => {
              stopPropagation(e);
              viewStore.setFilter({ tag: tag });
            }}
          >
            #{tag}
          </Badge>
        ))}
      </div>

      <Link
        className="flex flex-row justify-end items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        to={`/shortcut/${shortcut.id}#analytics`}
        onClick={stopPropagation}
        viewTransition
      >
        <Icon.BarChart2 className="w-3.5 h-auto shrink-0" />
        <span className="tabular-nums">{shortcut.viewCount}</span>
      </Link>

      <div className="flex flex-row justify-end items-center" onClick={stopPropagation}>
        {showActions && <ShortcutActionsDropdown shortcut={shortcut} />}
      </div>
    </div>
  );
};

export default ShortcutRow;
