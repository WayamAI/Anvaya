"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiGetWithMeta } from "@/lib/api";
import { inputSm } from "@/components/app/controls";
import { cn } from "@/lib/utils";

/**
 * A searchable picker over a paged list endpoint (/materials, /vendors,
 * /customers): the server searches by code and name and returns a bounded
 * page, so no list is ever loaded whole into the browser. Nothing is fetched
 * until the picker is opened (by a click, typing or Arrow-Down; not focus). Tenant scoping and permissions are the API's.
 */

interface PageMeta { nextCursor: string | null }

export function SearchPicker<T extends { id: string }>({
  endpoint, params = {}, label, value, onChange, format, placeholder = "Search by code or name…", pageSize = 20, debounceMs = 300,
  className, disabled,
}: {
  endpoint: string;
  /** Fixed filters, e.g. `{ kinds: "RAW,PACKAGING" }`. */
  params?: Record<string, string>;
  /** Accessible name. */
  label: string;
  value: T | null;
  onChange: (item: T) => void;
  format: (item: T) => string;
  placeholder?: string;
  pageSize?: number;
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [text, debounceMs]);

  const q = useInfiniteQuery({
    queryKey: ["picker", endpoint, params, term],
    queryFn: ({ pageParam, signal }) =>
      apiGetWithMeta<T[], PageMeta>(endpoint, { ...params, q: term || undefined, limit: pageSize, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    enabled: open,
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];

  /*
    Opened by a deliberate act — a click, typing, Arrow-Down — never by focus
    alone: a dialog autofocuses its first field, and a list opening on its
    own would spread over the fields below and catch the next click.
  */
  const openList = () => {
    if (open) return;
    setOpen(true);
    setText("");
    setActive(-1);
  };

  const choose = (item: T) => {
    onChange(item);
    setOpen(false);
    setText("");
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openList();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        className={inputSm}
        disabled={disabled}
        placeholder={value ? format(value) : placeholder}
        value={open ? text : value ? format(value) : ""}
        onMouseDown={openList}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div id={listId} role="listbox" aria-label={label}
          className="absolute z-50 mt-1 max-h-64 w-full min-w-[260px] overflow-auto rounded-md border border-border bg-popover py-1 text-body-sm shadow-md">
          {q.isPending ? (
            <p className="px-3 py-2 text-muted-foreground">Searching…</p>
          ) : q.error ? (
            <p className="px-3 py-2 text-danger">Could not search: {q.error.message}</p>
          ) : !items.length ? (
            <p className="px-3 py-2 text-muted-foreground">No matches{term ? ` for “${term}”` : ""}.</p>
          ) : (
            items.map((item, i) => (
              <div key={item.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                className={cn("cursor-pointer px-3 py-1.5", i === active ? "bg-secondary" : "hover:bg-secondary")}
                // mousedown, not click: it lands before the input's blur closes the list.
                onMouseDown={(e) => { e.preventDefault(); choose(item); }}>
                {format(item)}
              </div>
            ))
          )}
          {q.hasNextPage && (
            <button type="button" className="w-full px-3 py-1.5 text-left text-muted-foreground hover:bg-secondary"
              disabled={q.isFetchingNextPage}
              onMouseDown={(e) => { e.preventDefault(); void q.fetchNextPage(); }}>
              {q.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
