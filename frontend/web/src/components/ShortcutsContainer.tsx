import useNavigateTo from "@/hooks/useNavigateTo";
import useResponsiveWidth from "@/hooks/useResponsiveWidth";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import ShortcutCard from "./ShortcutCard";
import ShortcutRow from "./ShortcutRow";
import ShortcutView from "./ShortcutView";

interface Props {
  shortcutList: Shortcut[];
}

const ShortcutsContainer: React.FC<Props> = (props: Props) => {
  const { shortcutList } = props;
  const navigateTo = useNavigateTo();
  const { sm } = useResponsiveWidth();
  const viewStore = useViewStore();
  const displayStyle = viewStore.displayStyle || "full";
  // Aligned columns need horizontal room they don't have on a phone, so below
  // the `sm` breakpoint the list borrows the compact tile grid. The persisted
  // setting is untouched, so widening the window restores the list.
  const effectiveStyle = displayStyle === "list" && !sm ? "compact" : displayStyle;

  const handleShortcutClick = (shortcut: Shortcut) => {
    navigateTo(`/shortcut/${shortcut.id}`);
  };

  if (effectiveStyle === "list") {
    return (
      <div className="w-full flex flex-col justify-start items-stretch divide-y divide-border border-y border-border">
        {shortcutList.map((shortcut) => (
          <ShortcutRow key={shortcut.id} shortcut={shortcut} showActions={true} onClick={() => handleShortcutClick(shortcut)} />
        ))}
      </div>
    );
  }

  const ShortcutItemView = effectiveStyle === "compact" ? ShortcutView : ShortcutCard;

  return (
    <div
      className={cn(
        "w-full grid grid-cols-1 gap-3 sm:gap-4",
        effectiveStyle === "full" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {shortcutList.map((shortcut) => {
        return <ShortcutItemView key={shortcut.id} shortcut={shortcut} showActions={true} onClick={() => handleShortcutClick(shortcut)} />;
      })}
    </div>
  );
};

export default ShortcutsContainer;
