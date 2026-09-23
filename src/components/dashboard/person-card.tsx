import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils";
import type { IncidentPerson } from "./types";

interface PersonCardProps extends IncidentPerson {
  /** e.g. "AI Concierge is active". Omit to hide the assist row entirely. */
  assistLabel?: string;
}

/** Who is responsible right now, plus whether an assistant is engaged. */
export function PersonCard({ name, initials, role, assistLabel }: PersonCardProps) {
  return (
    <div className="rounded-cc-md border border-muted bg-action p-3 cc-inner-highlight">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-default bg-surface-raised-x2 text-caption font-medium text-secondary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-body-md text-primary">{name}</div>
          <div className="mt-1 truncate text-caption text-tertiary">{role}</div>
        </div>
      </div>
      {assistLabel && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1.5 border-t border-muted pt-2.5",
            "text-caption text-secondary",
          )}
        >
          <AppIcon name="sparkle" size="xs" tone="success" />
          {assistLabel}
        </div>
      )}
    </div>
  );
}
