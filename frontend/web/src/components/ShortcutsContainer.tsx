import { useState } from "react";
import { useViewStore } from "@/stores";
import { Density } from "@/stores/view";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import ShortcutCard from "./ShortcutCard";
import ShortcutContextMenu from "./ShortcutContextMenu";
import ShortcutGroupedIndex from "./ShortcutGroupedIndex";

interface Props {
  shortcutList: Shortcut[];
  onShortcutClick: (shortcut: Shortcut) => void;
}

// The grid fills by minimum card width rather than by a fixed column count, so
// a card never stretches wide enough for its footer to fall apart. Density only
// changes that minimum and the gap — one literal string per step, since Tailwind
// cannot see a computed class. A phone gets one comfortable column at every
// density; there is no second column to win by tightening.
const gridClasses: Record<Density, string> = {
  comfortable: "gap-3.5 grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]",
  compact: "gap-3.5 sm:gap-2.5 grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))]",
  dense: "gap-3.5 sm:gap-2 grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]",
};

interface MenuState {
  shortcut: Shortcut;
  x: number;
  y: number;
}

const ShortcutsContainer: React.FC<Props> = ({ shortcutList, onShortcutClick }: Props) => {
  const viewStore = useViewStore();
  const displayStyle = viewStore.displayStyle || "full";
  const density = viewStore.density || "comfortable";
  const [menu, setMenu] = useState<MenuState | null>(null);

  if (displayStyle === "list") {
    return <ShortcutGroupedIndex shortcutList={shortcutList} onShortcutClick={onShortcutClick} />;
  }

  // The usage bar on a card is a share of the busiest Shortcut currently shown,
  // so filtering rescales it rather than flattening every bar to nothing.
  const maxVisits = shortcutList.reduce((max, shortcut) => Math.max(max, shortcut.viewCount), 0);

  const handleContextMenu = (shortcut: Shortcut) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ shortcut, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div className={`w-full grid ${gridClasses[density]}`}>
        {shortcutList.map((shortcut) => (
          <ShortcutCard
            key={shortcut.id}
            shortcut={shortcut}
            density={density}
            maxVisits={maxVisits}
            onClick={() => onShortcutClick(shortcut)}
            onContextMenu={handleContextMenu(shortcut)}
          />
        ))}
      </div>

      {menu && <ShortcutContextMenu shortcut={menu.shortcut} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
};

export default ShortcutsContainer;
