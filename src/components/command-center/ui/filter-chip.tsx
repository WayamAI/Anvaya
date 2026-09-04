"use client";

import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Compact queue filter. Deliberately reads as an instrument control rather than
 * a SaaS button: dark fill, hairline border, muted label, brighter when active.
 */
export function FilterChip({ label, count, selected = false, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-cc-pill border px-3",
        "text-[12px] leading-none transition-colors duration-200 ease-cc",
        selected
          ? "border-default bg-surface-elevated text-primary"
          : "border-subtle bg-surface-tertiary text-secondary hover:border-default hover:bg-surface-elevated hover:text-primary",
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums transition-colors duration-200",
            selected ? "text-secondary" : "text-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
