import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Density } from "@/stores/view";

const options: { value: Density; labelKey: string }[] = [
  { value: "comfortable", labelKey: "filter.density-comfortable" },
  { value: "compact", labelKey: "filter.density-compact" },
  { value: "dense", labelKey: "filter.density-dense" },
];

// How much of the collection fits on one screen. It belongs to the card grid
// only — the index is already as tight as aligned rows get — so the dashboard
// renders it beside the ordering controls and drops it in the other view.
const DensityToggle = () => {
  const { t } = useTranslation();
  const viewStore = useViewStore();
  const density = viewStore.density || "comfortable";

  return (
    <div className="hidden lg:flex flex-row items-center gap-0.5 p-0.5 rounded-md border border-input">
      {options.map(({ value, labelKey }) => (
        <button
          key={value}
          className={cn(
            "h-7 px-2.5 rounded-sm text-sm transition-colors",
            value === density ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === density}
          onClick={() => viewStore.setDensity(value)}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
};

export default DensityToggle;
