"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { btnSecondarySm, inputSm } from "@/components/app/controls";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Return a string for plain text. */
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Tailwind width class, e.g. "w-[140px]". */
  width?: string;
  /** Use tabular figures — for any numeric column. */
  numeric?: boolean;
  /**
   * Plain value for this cell, used for sorting, searching and export.
   * Without it a column is inert: `cell` may return an element, and an element
   * cannot be compared, matched or written to a file.
   */
  value?: (row: T) => string | number;
  /** Opt a column out of sorting even though it has a `value`. */
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Shown when `rows` is empty. */
  empty?: React.ReactNode;
  /** Renders placeholder rows instead of content. */
  loading?: boolean;
  /** Show the search box. Needs at least one column with `value`. */
  searchable?: boolean;
  /** Show the column-visibility menu. */
  columnToggle?: boolean;
  /** Show the CSV export button. */
  exportable?: boolean;
  /** File stem for the exported CSV, and the accessible name of the table. */
  name?: string;
  /** Rows per page. 0 disables pagination. */
  pageSize?: number;
  /** Marks a row as selected — pair with `onRowClick` for master–detail. */
  isRowSelected?: (row: T) => boolean;
  /** Extra controls, placed at the left of the toolbar. */
  toolbar?: React.ReactNode;
  className?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

function compare(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function toCsv(value: string | number) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The one table in Anvaya.
 *
 * Thirty-five hand-rolled tables across twenty-four pages each had their own
 * header styling, padding and border treatment. This centralises the density,
 * the hairline rules and the horizontal-scroll guard that most of them lacked,
 * and adds the things a planner actually does with a long table: find a row,
 * order by a column, hide the columns they do not need, page through, and take
 * the result away as a file.
 *
 * Every interaction is opt-in per table and every one is derived state — the
 * `rows` prop is never mutated, so a caller's filtering and this component's
 * sorting compose rather than fight.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading = false,
  searchable = false,
  columnToggle = false,
  exportable = false,
  name = "table",
  pageSize = 0,
  isRowSelected,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));
  const hasToolbar = searchable || columnToggle || exportable || !!toolbar;

  // Searching and sorting both need a plain value; a column without one simply
  // does not participate rather than throwing.
  const searchable_ = columns.filter((c) => c.value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchable_.length) return rows;
    return rows.filter((r) =>
      searchable_.some((c) => String(c.value!(r)).toLowerCase().includes(q)),
    );
  }, [rows, query, searchable_]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return filtered;
    const out = [...filtered].sort((a, b) => compare(col.value!(a), col.value!(b)));
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort, columns]);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pageCount - 1);
  const paged = pageSize > 0 ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted;

  // A narrowed result set can leave the viewer on a page that no longer
  // exists; send them back to the first rather than to a blank one.
  useEffect(() => { setPage(0); }, [query, sort, rows]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const toggleSort = (key: string) => {
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );
  };

  const exportCsv = () => {
    const cols = visibleColumns.filter((c) => c.value);
    const lines = [
      cols.map((c) => toCsv(c.header)).join(","),
      ...sorted.map((r) => cols.map((c) => toCsv(c.value!(r))).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showEmpty = !loading && sorted.length === 0;

  return (
    <div className={cn("min-w-0", className)}>
      {hasToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {toolbar}
          {searchable && (
            <div className="relative min-w-0 flex-1 sm:max-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-quaternary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label={`Search ${name}`}
                className={cn(inputSm, "pl-8 pr-8")}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-quaternary hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-body-sm tabular-nums text-ink-tertiary">
              {sorted.length.toLocaleString()}
              {sorted.length !== rows.length && ` of ${rows.length.toLocaleString()}`} rows
            </span>

            {columnToggle && (
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMenuOpen((o) => !o)} className={btnSecondarySm} aria-expanded={menuOpen}>
                  <Columns3 /> Columns
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-input bg-popover p-1">
                    {columns.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-body-sm hover:bg-secondary"
                      >
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.key)}
                          onChange={() =>
                            setHidden((h) => {
                              const next = new Set(h);
                              // Never let the last column be hidden.
                              if (next.has(c.key)) next.delete(c.key);
                              else if (columns.length - next.size > 1) next.add(c.key);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                        <span className="truncate">{c.header}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {exportable && (
              <button type="button" onClick={exportCsv} className={btnSecondarySm}>
                <Download /> Export
              </button>
            )}
          </div>
        </div>
      )}

      {/* Every table scrolls in its own container, so a wide table never forces
          the page to scroll sideways. The height cap is what lets the header
          stick: without a scroll port of its own there is nothing to stick to. */}
      <div className="w-full overflow-auto border-y border-border bg-card [max-height:70vh]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              {visibleColumns.map((c) => {
                const canSort = !!c.value && c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      // Small caps rather than sentence case: it separates the
                      // header band from the data without a fill or a rule weight.
                      "label-caps whitespace-nowrap bg-card px-3 py-2",
                      // The sticky row needs its own rule; a border on the row
                      // scrolls away with the cells in some engines.
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border",
                      "relative",
                      c.align === "right" && "text-right",
                      c.width,
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                          active && "text-foreground",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        {active
                          ? (sort!.dir === "asc"
                            ? <ArrowUp className="h-3 w-3 shrink-0" />
                            : <ArrowDown className="h-3 w-3 shrink-0" />)
                          : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/head:opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border last:border-b-0">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      <span className="block h-3 w-full max-w-[160px] rounded bg-secondary" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading &&
              paged.map((row) => {
                const selected = isRowSelected?.(row) ?? false;
                return (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    aria-selected={isRowSelected ? selected : undefined}
                    className={cn(
                      "border-b border-border transition-colors duration-150 last:border-b-0",
                      onRowClick && "cursor-pointer",
                      selected ? "bg-secondary" : onRowClick && "hover:bg-sunken",
                    )}
                  >
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        // The plain value doubles as the tooltip, so a
                        // truncated cell can still be read in full on hover.
                        title={c.value ? String(c.value(row)) : undefined}
                        className={cn(
                          "max-w-[22rem] truncate px-3 py-2 align-middle text-body-sm",
                          selected ? "text-foreground" : "text-ink-secondary",
                          c.align === "right" && "text-right",
                          c.numeric && "tabular-nums",
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>

        {showEmpty && (
          <div className="px-3 py-10">
            {empty ?? (
              <p className="text-center text-body-sm text-ink-tertiary">
                {query ? `No rows match “${query}”.` : "Nothing to show yet."}
              </p>
            )}
          </div>
        )}
      </div>

      {pageSize > 0 && pageCount > 1 && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="text-body-sm tabular-nums text-ink-tertiary">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className={btnSecondarySm}
            >
              Previous
            </button>
            <span className="text-body-sm tabular-nums text-ink-tertiary">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
              className={btnSecondarySm}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
