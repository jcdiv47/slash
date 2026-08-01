import { useTranslation } from "react-i18next";
import { splitLink } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";

// Every Row shares this template so the columns line up down the page. Each Row
// is its own grid container, so alignment holds only because every track is
// fixed or `fr` — both resolve against the Row's width, which is identical for
// all Rows. Never switch a track to `auto` or `min-content`: those size to each
// Row's own content, and the columns immediately stop lining up. It also has to
// be one literal string, since Tailwind only sees static classes.
//
// Below `md` the columns that are context rather than answer — the Link and the
// Tags — are the ones that go: the Name is what is being scanned for, and it
// must not wrap.
export const SHORTCUT_ROW_COLUMNS =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] md:grid-cols-[1.25rem_minmax(0,19rem)_minmax(0,1fr)_12rem_4.5rem_1.5rem] items-center gap-3.5";

interface Props {
  shortcut: Shortcut;
  onClick?: () => void;
}

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

const ShortcutRow = ({ shortcut, onClick }: Props) => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const { host, path } = splitLink(shortcut.link);

  return (
    <div
      className={cn(SHORTCUT_ROW_COLUMNS, "group w-full px-2 py-2 transition-colors", onClick && "cursor-pointer hover:bg-accent/40")}
      onClick={onClick}
    >
      <div className="w-5 h-5 flex justify-center items-center overflow-clip shrink-0">
        <LinkFavicon url={shortcut.link} />
      </div>

      <div className="min-w-0 flex flex-row items-baseline gap-2">
        <a
          className="shortcut-name shrink-0 font-medium text-foreground hover:underline"
          href={`/s/${shortcut.name}`}
          target="_blank"
          onClick={stopPropagation}
        >
          s/{shortcut.name}
        </a>
        {shortcut.title && <span className="truncate text-sm text-muted-foreground">{shortcut.title}</span>}
        {shortcut.visibility === Visibility.PUBLIC && (
          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 rounded-sm border border-border text-xs text-muted-foreground">
            <Icon.Globe className="w-3 h-auto" />
            {t("shortcut.visibility.public.self")}
          </span>
        )}
      </div>

      <a
        className="hidden md:block min-w-0 truncate text-sm text-muted-foreground hover:underline"
        href={shortcut.link}
        target="_blank"
        onClick={stopPropagation}
      >
        <span className="text-foreground">{host}</span>
        {path}
      </a>

      <div className="hidden md:flex flex-row justify-start items-center gap-1.5 overflow-hidden">
        {shortcut.tags.map((tag) => (
          <button
            key={tag}
            className="shortcut-name shrink-0 px-1.5 py-0.5 rounded-sm bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              stopPropagation(e);
              viewStore.toggleTag(tag);
            }}
          >
            {tag}
          </button>
        ))}
      </div>

      <span className="shortcut-name text-right text-sm text-muted-foreground">{shortcut.viewCount}</span>

      <div className="hidden md:flex flex-row justify-end items-center text-muted-foreground/60">
        <Icon.ChevronRight className="w-4 h-auto" />
      </div>
    </div>
  );
};

export default ShortcutRow;
