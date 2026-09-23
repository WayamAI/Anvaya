"use client";

import { useMemo, useState } from "react";
import { ActionTable } from "./action-table";
import { FilterChip } from "./filter-chip";
import { IconButton } from "@/components/ui/icon-button";
import type { ActionItem, QueueFilter } from "./types";
import { cn } from "@/lib/utils";

interface ActionQueueProps {
  title?: string;
  items: ActionItem[];
  filters: QueueFilter[];
  selectedId?: string;
  onSelect?: (item: ActionItem) => void;
  subjectLabel?: string;
  assigneeLabel?: string;
  className?: string;
}

/** Client-side for now; the predicate shape matches what a query would take. */
function applyFilter(items: ActionItem[], filter: string): ActionItem[] {
  switch (filter) {
    case "critical":
    case "warning":
    case "info":
      return items.filter((i) => i.severity === filter);
    case "open":
      return items.filter((i) => i.state === "open");
    case "in-progress":
      return items.filter((i) => i.state === "in-progress");
    default:
      return items;
  }
}

export function ActionQueue({
  title = "Action needed queue",
  items,
  filters,
  selectedId,
  onSelect,
  subjectLabel,
  assigneeLabel,
  className,
}: ActionQueueProps) {
  const [filter, setFilter] = useState(filters[0]?.id ?? "all");
  const visible = useMemo(() => applyFilter(items, filter), [items, filter]);
  const total = filters[0]?.count;

  return (
    <section className={cn("cc-panel overflow-hidden", className)} aria-labelledby="queue-heading">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 id="queue-heading" className="text-label-md text-primary">
          {title}{" "}
          {total !== undefined && <span className="tabular-nums text-tertiary">({total})</span>}
        </h2>
        <div className="flex items-center gap-1">
          <IconButton icon="search" label="Search the queue" size="sm" />
          <IconButton icon="filter" label="Advanced filters" size="sm" />
        </div>
      </div>

      {/* Pills scroll horizontally before they ever wrap to a second row. */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            count={f.count}
            selected={filter === f.id}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </div>

      <ActionTable
        items={visible}
        selectedId={selectedId}
        onSelect={onSelect}
        subjectLabel={subjectLabel}
        assigneeLabel={assigneeLabel}
      />

      {visible.length === 0 && (
        <p className="px-4 py-8 text-center text-body-sm text-tertiary">
          No items match this filter.
        </p>
      )}
    </section>
  );
}
