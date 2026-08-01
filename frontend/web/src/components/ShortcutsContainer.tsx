import useResponsiveWidth from "@/hooks/useResponsiveWidth";
import { useViewStore } from "@/stores";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import ShortcutCard from "./ShortcutCard";
import ShortcutRow from "./ShortcutRow";
import ShortcutView from "./ShortcutView";

interface Props {
  shortcutList: Shortcut[];
  onShortcutClick: (shortcut: Shortcut) => void;
}

const ShortcutsContainer: React.FC<Props> = ({ shortcutList, onShortcutClick }: Props) => {
  const { sm } = useResponsiveWidth();
  const viewStore = useViewStore();
  const displayStyle = viewStore.displayStyle || "full";
  // Aligned columns need horizontal room they don't have on a phone, so below
  // the `sm` breakpoint the list borrows the compact tile grid. The persisted
  // setting is untouched, so widening the window restores the list.
  const effectiveStyle = displayStyle === "list" && !sm ? "compact" : displayStyle;

  if (effectiveStyle === "list") {
    return (
      <div className="w-full flex flex-col justify-start items-stretch divide-y divide-border border-y border-border">
        {shortcutList.map((shortcut) => (
          <ShortcutRow key={shortcut.id} shortcut={shortcut} onClick={() => onShortcutClick(shortcut)} />
        ))}
      </div>
    );
  }

  if (effectiveStyle === "compact") {
    return (
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {shortcutList.map((shortcut) => (
          <ShortcutView key={shortcut.id} shortcut={shortcut} showActions={true} onClick={() => onShortcutClick(shortcut)} />
        ))}
      </div>
    );
  }

  // The card grid fills by minimum card width rather than by a fixed column
  // count, so a card never stretches wide enough for its footer to fall apart.
  return (
    <div className="w-full grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(16.75rem,1fr))]">
      {shortcutList.map((shortcut) => (
        <ShortcutCard key={shortcut.id} shortcut={shortcut} onClick={() => onShortcutClick(shortcut)} />
      ))}
    </div>
  );
};

export default ShortcutsContainer;
