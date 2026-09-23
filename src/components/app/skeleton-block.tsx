import { cn } from "@/lib/utils";

/** Neutral placeholder for content that has not arrived yet. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-secondary", className)}
      aria-hidden="true"
    />
  );
}

/** Table-shaped placeholder, sized to the column count. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-busy="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-border px-3 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[120px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}
