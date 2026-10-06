import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExceptionsPanel, type MrpException } from "./exceptions-panel";

const ex = (id: string, over: Partial<MrpException> = {}): MrpException => ({
  id, type: "MATERIAL_SHORTAGE", severity: "CRITICAL", message: `Short ${id}`, suggestedAction: "Expedite",
  material: { code: "RM-1", name: "Resin" }, location: { name: "Pune" }, dueDate: "2026-10-05", daysLate: null, isResolved: false, ...over,
});
const base = { canResolve: false, onResolve: vi.fn(), onRetry: vi.fn(), onLoadMore: vi.fn() };
const NOTHING = /no exceptions/i;

describe("ExceptionsPanel", () => {
  it("shows loading as loading, never as 'no exceptions'", () => {
    render(<ExceptionsPanel {...base} state={{ status: "pending" }} />);
    expect(screen.getByLabelText(/loading exceptions/i)).toBeInTheDocument();
    expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
  });

  it("shows a failed load as a failure, with a retry, never as 'no exceptions'", () => {
    const onRetry = vi.fn();
    render(<ExceptionsPanel {...base} onRetry={onRetry} state={{ status: "error", error: new Error("Request failed (503)") }} />);
    expect(screen.getByText(/exceptions could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says there are no exceptions only when the run truly has none", () => {
    render(<ExceptionsPanel {...base} state={{ status: "success", exceptions: [], hasMore: false }} />);
    expect(screen.getByText(NOTHING)).toBeInTheDocument();
  });

  it("lists exceptions, offers resolve to planners, and loads more on request", () => {
    const onResolve = vi.fn();
    const onLoadMore = vi.fn();
    render(<ExceptionsPanel {...base} canResolve onResolve={onResolve} onLoadMore={onLoadMore}
      state={{ status: "success", exceptions: [ex("a"), ex("b", { isResolved: true })], hasMore: true }} />);
    expect(screen.getByText("Short a")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    expect(onResolve).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
