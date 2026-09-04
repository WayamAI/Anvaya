"use client";

import { useMemo, useState } from "react";
import { ListFilter, Search } from "lucide-react";
import { ActionTable } from "./action-table";
import { FilterChip } from "./ui/filter-chip";
import { IconButton } from "./ui/icon-button";
import {
  actionQueue,
  queueFilters,
  type ActionItem,
  type QueueFilterId,
} from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

interface ActionQueueProps {
  selectedId?: string;
  onSelect?: (item: ActionItem) => void;
  className?: string;
}

/** Filters are client-side for now; the shape matches what a query would take. */
function applyFilter(items: ActionItem[], filter: QueueFilterId): ActionItem[] {
  switch (filter) {
    case "critical":
    case "warning":
    case "info":
      return items.filter((i) => i.severity === filter);
    case "open":
      return items.filter((i) => i.state === "open");
    case "in-progress":
      return items.filter((i) => i.state === "in-progress");
    case "all":
    case "today":
    default:
      return items;
  }
}

export function ActionQueue({ selectedId, onSelect, className }: ActionQueueProps) {
  const [filter, setFilter] = useState<QueueFilterId>("all");
  const items = useMemo(() => applyFilter(actionQueue, filter), [filter]);

  return (
    <section className={cn("cc-panel overflow-hidden", className)} aria-labelledby="queue-heading">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 id="queue-heading" className="text-[13px] font-medium leading-none text-primary">
          Action Needed Queue{" "}
          <span className="text-muted tabular-nums">({queueFilters[0].count})</span>
        </h2>
        <div className="flex items-center gap-1">
          <IconButton label="Search the queue" size="sm" variant="ghost">
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Advanced filters" size="sm" variant="ghost">
            <ListFilter className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      {/* Pills scroll horizontally before they ever wrap into a second row. */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {queueFilters.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            count={f.count}
            selected={filter === f.id}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </div>

      <ActionTable items={items} selectedId={selectedId} onSelect={onSelect} />

      {items.length === 0 && (
        <p className="px-4 py-8 text-center text-[12px] text-muted">
          No items match this filter.
        </p>
      )}
    </section>
  );
}
