import copy from "copy-to-clipboard";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { absolutifyLink } from "@/helpers/utils";
import { cn } from "@/lib/utils";
import { useUserStore, useViewStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import Icon from "./Icon";
import LinkFavicon from "./LinkFavicon";
import ShortcutActionsDropdown from "./ShortcutActionsDropdown";
import VisibilityIcon from "./VisibilityIcon";

interface Props {
  shortcut: Shortcut;
  className?: string;
  showActions?: boolean;
  onClick?: () => void;
}

// Interactive descendants must not bubble to the card's own onClick, or a click
// on a tag would both filter the list and navigate away from it.
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

const ShortcutCard = (props: Props) => {
  const { shortcut, className, showActions, onClick } = props;
  const { t } = useTranslation();
  const userStore = useUserStore();
  const viewStore = useViewStore();
  const creator = userStore.getUserById(shortcut.creatorId);
  const shortcutLink = absolutifyLink(`/s/${shortcut.name}`);

  useEffect(() => {
    userStore.getOrFetchUserById(shortcut.creatorId);
  }, []);

  const handleCopyButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    copy(shortcutLink);
    toast.success("Shortcut link copied to clipboard.");
  };

  return (
    <Card
      className={cn(
        "group p-3 w-full flex flex-col justify-start items-start transition-colors",
        onClick && "cursor-pointer hover:bg-accent/50",
        className,
      )}
      onClick={onClick}
    >
      <div className="w-full flex flex-row justify-between items-center">
        <div className="w-[calc(100%-16px)] flex flex-row justify-start items-center mr-1 shrink-0">
          <Link
            className="w-8 h-8 flex justify-center items-center overflow-clip shrink-0 rounded-sm"
            to={`/shortcut/${shortcut.id}`}
            onClick={stopPropagation}
            viewTransition
          >
            <LinkFavicon url={shortcut.link} />
          </Link>
          <div className="ml-3 w-[calc(100%-24px)] flex flex-col justify-start items-start">
            <div className="w-full flex flex-row justify-start items-center leading-tight">
              <a
                className="max-w-[calc(100%-36px)] flex flex-row justify-start items-center mr-1 hover:opacity-80 hover:underline transition-all"
                target="_blank"
                href={shortcutLink}
                onClick={stopPropagation}
              >
                <div className="truncate">
                  {shortcut.title ? (
                    <span className="text-foreground font-medium">{shortcut.title}</span>
                  ) : (
                    <span className="shortcut-name truncate text-foreground font-medium">s/{shortcut.name}</span>
                  )}
                </div>
                <span className="hidden group-hover:block ml-1 shrink-0">
                  <Icon.ExternalLink className="w-4 h-auto text-muted-foreground" />
                </span>
              </a>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="hidden group-hover:block text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleCopyButtonClick}
                  >
                    <Icon.Clipboard className="w-4 h-auto" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {shortcut.title && (
              <span className="shortcut-name leading-tight text-sm truncate text-muted-foreground">s/{shortcut.name}</span>
            )}
            <a
              className="pr-4 leading-tight w-full text-sm truncate text-muted-foreground hover:underline transition-all"
              href={shortcut.link}
              target="_blank"
              onClick={stopPropagation}
            >
              {shortcut.link}
            </a>
          </div>
        </div>
        {showActions && (
          <div className="h-full pt-2 flex flex-row justify-end items-start" onClick={stopPropagation}>
            <ShortcutActionsDropdown shortcut={shortcut} />
          </div>
        )}
      </div>
      <div className="mt-2 w-full flex flex-row justify-start items-start gap-1.5 truncate">
        {shortcut.tags.map((tag) => {
          return (
            <Badge
              key={tag}
              variant="secondary"
              className="max-w-[8rem] truncate cursor-pointer hover:bg-secondary/80 transition-colors"
              onClick={(e) => {
                stopPropagation(e);
                viewStore.setFilter({ tag: tag });
              }}
            >
              #{tag}
            </Badge>
          );
        })}
        {shortcut.tags.length === 0 && <span className="text-muted-foreground text-sm italic">No tags</span>}
      </div>
      <div className="w-full mt-2 flex gap-3 overflow-x-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">{creator.nickname.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{creator.nickname}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex flex-row justify-start items-center gap-1 text-muted-foreground text-sm cursor-pointer hover:text-foreground transition-colors"
              onClick={(e) => {
                stopPropagation(e);
                viewStore.setFilter({ visibility: shortcut.visibility });
              }}
            >
              <VisibilityIcon className="w-4 h-auto" visibility={shortcut.visibility} />
              {t(`shortcut.visibility.${shortcut.visibility.toLowerCase()}.self`)}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t(`shortcut.visibility.${shortcut.visibility.toLowerCase()}.description`)}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              className="flex flex-row justify-start items-center gap-1 text-muted-foreground text-sm hover:text-foreground transition-colors"
              to={`/shortcut/${shortcut.id}#analytics`}
              onClick={stopPropagation}
              viewTransition
            >
              <Icon.BarChart2 className="w-4 h-auto" />
              {t("shortcut.visits", { count: shortcut.viewCount })}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>View count</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </Card>
  );
};

export default ShortcutCard;
