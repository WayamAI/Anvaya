"use client";

import { StatusBadge } from "./status-badge";
import type { ActionItem } from "./types";
import { cn } from "@/lib/utils";

interface ActionTableProps {
  items: ActionItem[];
  selectedId?: string;
  onSelect?: (item: ActionItem) => void;
  /** Column heading for the identifier column, e.g. "Asset" or "Vehicle". */
  subjectLabel?: string;
  /** Column heading for the person column, e.g. "Operator" or "Driver". */
  assigneeLabel?: string;
}

const headCell =
  "sticky top-0 z-10 bg-surface-container px-3 py-2 text-left text-caption font-medium uppercase tracking-[0.09em] text-tertiary";

export function ActionTable({
  items,
  selectedId,
  onSelect,
  subjectLabel = "Asset",
  assigneeLabel = "Operator",
}: ActionTableProps) {
  return (
    // Scrolls in its own container so the header can stick and narrow viewports
    // never force the page to scroll sideways.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <caption className="sr-only">Items requiring action</caption>
        <thead>
          <tr className="border-b border-muted">
            <th scope="col" className={cn(headCell, "w-9 pr-0")}>
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className={cn(headCell, "w-[104px]")}>
              Priority
            </th>
            <th scope="col" className={cn(headCell, "w-[150px]")}>
              {subjectLabel}
            </th>
            <th scope="col" className={headCell}>
              Description
            </th>
            <th scope="col" className={cn(headCell, "w-[92px]")}>
              Time
            </th>
            <th scope="col" className={cn(headCell, "w-[148px]")}>
              {assigneeLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <tr
                key={item.id}
                onClick={() => onSelect?.(item)}
                aria-selected={selected}
                className={cn(
                  "group cursor-pointer border-b border-muted",
                  "transition-colors duration-150 ease-cc",
                  selected ? "bg-surface-raised" : "hover:bg-surface-raised/70",
                )}
              >
                <td className="px-3 py-0">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "h-3.5 w-3.5 cursor-pointer appearance-none rounded-[4px]",
                      "border border-default bg-action",
                      "checked:border-action-primary checked:bg-action-primary",
                      "transition-colors duration-150",
                    )}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge severity={item.severity} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-body-md tabular-nums text-primary">{item.subject}</div>
                  <div className="mt-1 text-caption text-tertiary">{item.subjectDetail}</div>
                </td>
                <td className="px-3 py-2.5">
                  <p className="truncate text-body-md text-secondary">{item.description}</p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-body-sm tabular-nums text-secondary">{item.timestamp}</div>
                  <div className="mt-1 text-caption text-tertiary">{item.time}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-muted bg-surface-raised-x2 text-caption font-medium text-secondary"
                      aria-hidden="true"
                    >
                      {item.assigneeInitials}
                    </span>
                    <span className="truncate text-body-sm text-secondary">{item.assignee}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
