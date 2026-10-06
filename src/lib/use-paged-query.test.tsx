import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ apiGetWithMeta: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), apiGetWithMeta: api.apiGetWithMeta }));

import { useDebounced, usePagedQuery } from "./use-paged-query";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("usePagedQuery", () => {
  it("fetches the first page with the filters, then the next by cursor", async () => {
    api.apiGetWithMeta
      .mockResolvedValueOnce({ data: ["a", "b"], meta: { nextCursor: "b", limit: 2, total: 3 } })
      .mockResolvedValueOnce({ data: ["c"], meta: { nextCursor: null, limit: 2, total: 3 } });
    const { result } = renderHook(() => usePagedQuery<string[]>(["things"], "/things", { status: "OPEN", q: undefined }), { wrapper });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(api.apiGetWithMeta).toHaveBeenLastCalledWith("/things", { status: "OPEN", q: undefined, cursor: undefined }, expect.anything());
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());
    expect(api.apiGetWithMeta).toHaveBeenLastCalledWith("/things", { status: "OPEN", q: undefined, cursor: "b" }, expect.anything());
    await waitFor(() => expect(result.current.data!.pages.flatMap((p) => p.data)).toEqual(["a", "b", "c"]));
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe("useDebounced", () => {
  it("passes a value on only once it has settled", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: "a" } });
    rerender({ v: "ab" });
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("ab");
    vi.useRealTimers();
  });
});
