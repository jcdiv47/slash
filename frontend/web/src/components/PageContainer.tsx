import { cn } from "@/lib/utils";

// Every surface — the header included — sits in this container, so the logo
// lines up with the content beneath it and the gutters never change width as a
// Member moves between Shortcuts and Analytics. Below `sm` the wide gutter eats
// too much of a phone, so it narrows.
const PageContainer = ({ className, children }: { className?: string; children?: React.ReactNode }) => (
  <div className={cn("mx-auto w-full max-w-[1240px] px-4 sm:px-6", className)}>{children}</div>
);

export default PageContainer;
