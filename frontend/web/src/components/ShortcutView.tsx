import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";
import ShortcutActionsDropdown from "./ShortcutActionsDropdown";

interface Props {
  shortcut: Shortcut;
  className?: string;
  showActions?: boolean;
  alwaysShowLink?: boolean;
  onClick?: () => void;
}

const ShortcutView = (props: Props) => {
  const { shortcut, className, showActions, alwaysShowLink, onClick } = props;

  return (
    <div
      className={cn(
        "group w-full px-3 py-2 flex flex-row justify-start items-center border border-border rounded-md bg-card hover:bg-accent transition-colors",
        className,
      )}
      onClick={onClick}
    >
      <div className="w-5 h-5 flex justify-center items-center overflow-clip shrink-0">
        <LinkFavicon url={shortcut.link} />
      </div>
      <div className="ml-2 w-full truncate">
        {shortcut.title ? (
          <>
            <span className="text-foreground">{shortcut.title}</span>
            <span className="shortcut-name text-muted-foreground text-sm ml-1">s/{shortcut.name}</span>
          </>
        ) : (
          <span className="shortcut-name text-foreground">s/{shortcut.name}</span>
        )}
      </div>
      <Link
        className={cn(
          "hidden group-hover:block ml-1 w-6 h-6 p-1 shrink-0 rounded-sm bg-muted hover:opacity-80",
          alwaysShowLink && "!block",
        )}
        to={`/s/${shortcut.name}`}
        target="_blank"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon.ArrowUpRight className="w-4 h-auto text-muted-foreground shrink-0" />
      </Link>
      {showActions && (
        <div className="ml-1 flex flex-row justify-end items-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <ShortcutActionsDropdown shortcut={shortcut} />
        </div>
      )}
    </div>
  );
};

export default ShortcutView;
