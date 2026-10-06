import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ apiGetWithMeta: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), apiGetWithMeta: api.apiGetWithMeta }));

import { SearchPicker } from "./search-picker";

interface Item { id: string; code: string; name: string }
const page = (items: Item[], nextCursor: string | null = null) => ({ data: items, meta: { nextCursor, limit: 20 } });
const resin = { id: "m1", code: "RM-1", name: "Resin" };
const film = { id: "m2", code: "PM-9", name: "Film" };

function renderPicker(onChange = vi.fn(), value: Item | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SearchPicker<Item> endpoint="/materials" params={{ kinds: "RAW,PACKAGING" }} label="Material" value={value} onChange={onChange}
        format={(m) => `${m.code} — ${m.name}`} debounceMs={0} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => api.apiGetWithMeta.mockReset());

describe("SearchPicker", () => {
  it("loads nothing until it is opened", () => {
    renderPicker();
    expect(api.apiGetWithMeta).not.toHaveBeenCalled();
  });

  it("does not open on focus alone, so a dialog's autofocus cannot spread a list over the form", () => {
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Material" });
    fireEvent.focus(box);
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.apiGetWithMeta).not.toHaveBeenCalled();
  });

  it("opens from the keyboard with Arrow-Down or by typing", () => {
    api.apiGetWithMeta.mockResolvedValue(page([]));
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Material" });
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box).toHaveAttribute("aria-expanded", "true");
  });

  it("searches the server by what is typed, a bounded page at a time", async () => {
    api.apiGetWithMeta.mockResolvedValue(page([resin]));
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Material" });
    fireEvent.mouseDown(box);
    fireEvent.change(box, { target: { value: "res" } });
    await waitFor(() => expect(api.apiGetWithMeta).toHaveBeenLastCalledWith(
      "/materials", { kinds: "RAW,PACKAGING", q: "res", limit: 20, cursor: undefined }, expect.anything()));
    expect(await screen.findByRole("option", { name: "RM-1 — Resin" })).toBeInTheDocument();
  });

  it("selects with the mouse or the keyboard, and shows the choice", async () => {
    api.apiGetWithMeta.mockResolvedValue(page([resin, film]));
    const onChange = renderPicker();
    const box = screen.getByRole("combobox", { name: "Material" });
    fireEvent.mouseDown(box);
    await screen.findByRole("option", { name: "PM-9 — Film" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(film);
    fireEvent.mouseDown(box);
    fireEvent.mouseDown(await screen.findByRole("option", { name: "RM-1 — Resin" }));
    expect(onChange).toHaveBeenLastCalledWith(resin);
  });

  it("loads the next page on request, by cursor", async () => {
    api.apiGetWithMeta.mockResolvedValueOnce(page([resin], "m1")).mockResolvedValueOnce(page([film]));
    renderPicker();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Material" }));
    fireEvent.mouseDown(await screen.findByRole("button", { name: /load more/i }));
    expect(await screen.findByRole("option", { name: "PM-9 — Film" })).toBeInTheDocument();
    expect(api.apiGetWithMeta).toHaveBeenLastCalledWith("/materials", expect.objectContaining({ cursor: "m1" }), expect.anything());
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("tells no matches apart from a failed search", async () => {
    api.apiGetWithMeta.mockResolvedValueOnce(page([]));
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Material" });
    fireEvent.mouseDown(box);
    expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
    api.apiGetWithMeta.mockRejectedValueOnce(new Error("Request failed (503)"));
    fireEvent.change(box, { target: { value: "x" } });
    expect(await screen.findByText(/could not search/i)).toBeInTheDocument();
  });
});
