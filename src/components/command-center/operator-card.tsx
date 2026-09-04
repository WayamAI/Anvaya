import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface OperatorCardProps {
  name: string;
  initials: string;
  role: string;
  assistActive?: boolean;
}

/** Who is on the asset right now, plus whether the AI planner is assisting. */
export function OperatorCard({ name, initials, role, assistActive = true }: OperatorCardProps) {
  return (
    <div className="rounded-cc-md border border-subtle bg-surface-tertiary p-3 cc-inner-highlight">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-default bg-surface-elevated text-[11px] font-medium leading-none text-secondary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] leading-none text-primary">{name}</div>
          <div className="mt-1 truncate text-[11px] leading-none text-muted">{role}</div>
        </div>
      </div>
      {assistActive && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1.5 border-t border-subtle pt-2.5",
            "text-[11px] leading-none text-secondary",
          )}
        >
          <Sparkles className="h-3 w-3 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
          AI Planner is active
        </div>
      )}
    </div>
  );
}
