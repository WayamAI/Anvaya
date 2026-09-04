"use client";

import { StatusBadge } from "./ui/status-badge";
import type { ActionItem } from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

interface ActionTableProps {
  items: ActionItem[];
  selectedId?: string;
  onSelect?: (item: ActionItem) => void;
}

const headCell =
  "sticky top-0 z-10 bg-surface-secondary px-3 py-2 text-left text-[10px] font-medium uppercase leading-none tracking-[0.09em] text-muted";

export function ActionTable({ items, selectedId, onSelect }: ActionTableProps) {
  return (
    // Container scrolls on its own so the header can stick and narrow viewports
    // never force the page to scroll sideways.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <caption className="sr-only">Production exceptions requiring action</caption>
        <thead>
          <tr className="border-b border-subtle">
            <th scope="col" className={cn(headCell, "w-9 pr-0")}>
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className={cn(headCell, "w-[104px]")}>
              Priority
            </th>
            <th scope="col" className={cn(headCell, "w-[150px]")}>
              Asset
            </th>
            <th scope="col" className={headCell}>
              Description
            </th>
            <th scope="col" className={cn(headCell, "w-[92px]")}>
              Time
            </th>
            <th scope="col" className={cn(headCell, "w-[148px]")}>
              Operator
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
                  "group cursor-pointer border-b border-subtle",
                  "transition-colors duration-150 ease-cc",
                  selected ? "bg-surface-tertiary" : "hover:bg-surface-tertiary/70",
                )}
              >
                <td className="px-3 py-0">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "h-3.5 w-3.5 cursor-pointer appearance-none rounded-[4px]",
                      "border border-default bg-surface-tertiary",
                      "checked:border-action-primary checked:bg-action-primary",
                      "transition-colors duration-150",
                    )}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge severity={item.severity} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-[13px] leading-none text-primary tabular-nums">
                    {item.asset}
                  </div>
                  <div className="mt-1 text-[11px] leading-none text-muted">
                    {item.assetLine}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <p className="truncate text-[13px] leading-none text-secondary">
                    {item.description}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-[12px] leading-none text-secondary tabular-nums">
                    {item.timestamp}
                  </div>
                  <div className="mt-1 text-[11px] leading-none text-muted">{item.time}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-elevated text-[10px] font-medium leading-none text-secondary"
                      aria-hidden="true"
                    >
                      {item.operatorInitials}
                    </span>
                    <span className="truncate text-[12px] leading-none text-secondary">
                      {item.operator}
                    </span>
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
