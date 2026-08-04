import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { GroupBy } from "@/stores/view";

const options: { value: GroupBy; labelKey: string }[] = [
  { value: "site", labelKey: "filter.group-by-site" },
  { value: "tag", labelKey: "filter.group-by-tag" },
  { value: "recency", labelKey: "filter.group-by-recency" },
];

// What the grouped index files Shortcuts under. Only meaningful while the index
// is on screen, so the dashboard shows it in place of the Density control rather
// than alongside it.
const GroupByToggle = () => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const groupBy = viewStore.groupBy || "site";

  return (
    <div className="hidden md:flex flex-row items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">{t("filter.group-by")}</span>
      <div className="flex flex-row items-center gap-0.5 p-0.5 rounded-md border border-input">
        {options.map(({ value, labelKey }) => (
          <button
            key={value}
            className={cn(
              "h-6 px-2.5 rounded-sm text-sm transition-colors",
              value === groupBy ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={value === groupBy}
            onClick={() => viewStore.setGroupBy(value)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GroupByToggle;
