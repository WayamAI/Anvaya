import { cn } from "@/lib/utils";

/**
 * Abstract placeholder mark.
 *
 * The Anvaya asset in `src/assets` is a mark + wordmark lockup in brand orange:
 * the type is illegible at rail size and the colour breaks the monochrome
 * column, so this stands in until a dedicated square mark exists.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
        "border border-muted bg-action text-icon-secondary",
        className,
      )}
      role="img"
      aria-label="Anvaya"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-icon-lg w-icon-lg"
        fill="none"
        aria-hidden="true"
      >
        {/* Angular apex over a telemetry sweep — motion, read at a glance. */}
        <path
          d="M4 14.5 10 4l6 10.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.6 15.4a5.6 5.6 0 0 0 6.8 0"
          stroke="currentColor"
          opacity="0.45"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
