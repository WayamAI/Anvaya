"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { apiGetWithMeta } from "./api";

/**
 * A cursor-paged list endpoint as an infinite query: the first page with the
 * given filters, more on `fetchNextPage()`. The filters are part of the key,
 * so changing a tab or search starts again from the first page, showing the
 * previous results meanwhile instead of flashing empty.
 */

export interface PageMeta {
  nextCursor: string | null;
  limit: number;
  total?: number;
}

export function usePagedQuery<D>(
  key: readonly unknown[], path: string, params: Record<string, string | undefined>, opts: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    enabled: opts.enabled ?? true,
    queryKey: [...key, params],
    queryFn: ({ pageParam, signal }) => apiGetWithMeta<D, PageMeta>(path, { ...params, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** The value, once it has stopped changing for `ms` — for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
