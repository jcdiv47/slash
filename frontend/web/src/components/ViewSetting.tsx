import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { DisplayStyle, Order } from "@/stores/view";
import Icon from "./Icon";
import Dropdown from "./common/Dropdown";

const displayStyleOptions: { value: DisplayStyle; icon: Icon.LucideIcon; labelKey: string }[] = [
  { value: "full", icon: Icon.LayoutGrid, labelKey: "filter.display-full" },
  { value: "compact", icon: Icon.Grid3x3, labelKey: "filter.display-compact" },
  { value: "list", icon: Icon.List, labelKey: "filter.display-list" },
];

const orderFieldOptions: { value: Order["field"]; labelKey: string }[] = [
  { value: "name", labelKey: "filter.order-by-name" },
  { value: "createdTs", labelKey: "filter.order-by-created" },
  { value: "updatedTs", labelKey: "filter.order-by-updated" },
  { value: "view", labelKey: "filter.order-by-visits" },
];

const ViewSetting = () => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const order = viewStore.getOrder();
  const { field, direction } = order;
  const displayStyle = viewStore.displayStyle || "full";
  const directionLabel = t(direction === "asc" ? "filter.direction-asc" : "filter.direction-desc");

  const toggleDirection = () => viewStore.setOrder({ direction: direction === "asc" ? "desc" : "asc" });

  return (
    <>
      {/* Wide screens spread the three controls across one row of icons; narrow
      screens fold them into the dropdown below. Both are always mounted and
      swapped by CSS, so there is no resize listener to keep in sync. */}
      <div className="hidden md:flex flex-row justify-end items-center gap-2">
        <div className="flex flex-row items-center gap-0.5 p-0.5 rounded-md border border-input">
          {displayStyleOptions.map(({ value, icon: OptionIcon, labelKey }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "w-7 h-7 flex justify-center items-center rounded transition-colors",
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
        <Select value={field} onValueChange={(value) => viewStore.setOrder({ field: value as Order["field"] })}>
          <SelectTrigger className="w-36 h-9" aria-label={t("filter.order-by")}>
            <div className="min-w-0 flex flex-row justify-start items-center gap-2">
              <Icon.ArrowUpDown className="w-4 h-auto shrink-0 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {orderFieldOptions.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="w-9 px-0" aria-label={directionLabel} onClick={toggleDirection}>
              {direction === "asc" ? <Icon.ArrowUp /> : <Icon.ArrowDown />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{directionLabel}</TooltipContent>
        </Tooltip>
      </div>

      <Dropdown
        className="md:hidden"
        trigger={
          <button aria-label={t("filter.display")}>
            <Icon.Settings2 className="w-4 h-auto text-muted-foreground" />
          </button>
        }
        actionsClassName="!mt-3 !right-[unset] -left-24 -ml-2"
        actions={
          <div className="w-52 p-2 gap-2 flex flex-col justify-start items-start" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex flex-row justify-between items-center">
              <span className="text-sm shrink-0 mr-2">{t("filter.display")}</span>
              <Select value={displayStyle} onValueChange={(value) => viewStore.setDisplayStyle(value as DisplayStyle)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {displayStyleOptions.map(({ value, labelKey }) => (
                    <SelectItem key={value} value={value}>
                      {t(labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator className="!my-1" />
            <div className="w-full flex flex-row justify-between items-center">
              <span className="text-sm shrink-0 mr-2">{t("filter.order-by")}</span>
              <Select value={field} onValueChange={(value) => viewStore.setOrder({ field: value as Order["field"] })}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderFieldOptions.map(({ value, labelKey }) => (
                    <SelectItem key={value} value={value}>
                      {t(labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full flex flex-row justify-between items-center">
              <span className="text-sm shrink-0 mr-2">{t("filter.direction")}</span>
              <Select value={direction} onValueChange={(value) => viewStore.setOrder({ direction: value as Order["direction"] })}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">{t("filter.direction-asc")}</SelectItem>
                  <SelectItem value="desc">{t("filter.direction-desc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      ></Dropdown>
    </>
  );
};

export default ViewSetting;
