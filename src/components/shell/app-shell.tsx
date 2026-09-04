import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

/**
 * Full-viewport application frame: fixed rail on the left, everything else in a
 * single scroll context on the right. The page itself never scrolls — inner
 * regions own their overflow, so the frame stays put.
 */
export function AppShell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cc-root flex h-dvh w-full overflow-hidden bg-page font-sans",
        className,
      )}
    >
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
