import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="w-full min-h-[100dvh] px-4 flex flex-col justify-center items-center text-center bg-background">
      {/* pb pushes the block optically above centre; mathematically centred reads low. */}
      <div className="pb-16 flex flex-col items-center">
        <p className="shortcut-name text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">This address doesn&apos;t match any page, shortcut, or collection.</p>
        <Button variant="outline" size="sm" className="mt-5 h-8" asChild>
          <Link to="/" viewTransition>
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
