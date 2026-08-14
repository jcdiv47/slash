import { TagCount } from "@/helpers/shortcut";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/stores";

interface Props {
  // Counted over the search-filtered set, so the numbers track what is actually
  // on screen rather than what exists in the Workspace.
  tags: TagCount[];
}

// Tags narrow together: picking two shows the Shortcuts carrying both. That is
// what makes the counts worth showing — they say how much each Tag would cut.
const TagFilter = ({ tags }: Props) => {
  const viewStore = useViewStore();
  const selectedTags = viewStore.getTags();

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-4 flex flex-row justify-start items-center flex-wrap gap-1.5">
      {tags.map((tag) => {
        const isSelected = selectedTags.includes(tag.name);
        return (
          <button
            key={tag.name}
            className={cn(
              "h-6 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sm transition-[color,background-color,transform] duration-150 active:scale-[0.98]",
              isSelected ? "bg-primary text-primary-foreground font-medium" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={isSelected}
            onClick={() => viewStore.toggleTag(tag.name)}
          >
            <span className={cn("font-mono", isSelected ? "text-primary-foreground/60" : "text-muted-foreground/70")}>#</span>
            {tag.name}
            <span className={cn("font-mono text-xs", isSelected ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
              {tag.count}
            </span>
          </button>
        );
      })}
      {selectedTags.length > 0 && (
        <button
          className="h-6 px-2.5 rounded-md border border-input text-sm font-medium text-muted-foreground hover:text-foreground transition-[color,transform] duration-150 active:scale-[0.98]"
          onClick={() => viewStore.setFilter({ tags: [] })}
        >
          Clear
        </button>
      )}
    </div>
  );
};

export default TagFilter;
