import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { DisplayStyle } from "@/stores/view";
import Icon from "./Icon";

const options: { value: DisplayStyle; icon: Icon.LucideIcon; labelKey: string }[] = [
  { value: "full", icon: Icon.LayoutGrid, labelKey: "filter.display-full" },
  { value: "compact", icon: Icon.Grid3x3, labelKey: "filter.display-compact" },
  { value: "list", icon: Icon.List, labelKey: "filter.display-list" },
];

// Which shape the Shortcut collection takes is the one view setting worth a
// permanent seat in the header: it is the control a Member reaches for while
// scanning, unlike ordering, which is set once and left alone.
const DisplayStyleToggle = () => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const displayStyle = viewStore.displayStyle || "full";

  return (
    <div className="flex flex-row items-center gap-0.5 p-0.5 rounded-md border border-input">
      {options.map(({ value, icon: OptionIcon, labelKey }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "w-7 h-6 flex justify-center items-center rounded-sm transition-colors",
                value === displayStyle
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              aria-label={t(labelKey)}
              aria-pressed={value === displayStyle}
              onClick={() => viewStore.setDisplayStyle(value)}
            >
              <OptionIcon className="w-4 h-auto" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t(labelKey)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

export default DisplayStyleToggle;
