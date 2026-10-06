import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/purchase-orders" }));

import { ErrorFallback } from "./error-fallback";

const boom = Object.assign(new Error('relation "purchase_orders" does not exist at db-internal:5432'), { digest: "2817364019" });

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
});

describe("ErrorFallback", () => {
  it("says something went wrong without revealing what, and gives a reference", () => {
    render(<ErrorFallback error={boom} reset={() => {}} />);
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText(/2817364019/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/purchase_orders|db-internal|5432/);
  });

  it("tries again by re-rendering the segment and refreshing server data", () => {
    const reset = vi.fn();
    render(<ErrorFallback error={boom} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers a way back to the dashboard", () => {
    render(<ErrorFallback error={boom} reset={() => {}} />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
  });

  it("reports the failure to the server log once, with the page and reference", () => {
    // A fresh error: the ones above were already reported, and each is reported once.
    const fresh = Object.assign(new Error(boom.message), { digest: boom.digest });
    const { rerender } = render(<ErrorFallback error={fresh} reset={() => {}} />);
    rerender(<ErrorFallback error={fresh} reset={() => {}} />);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/v1/client-errors");
    expect(JSON.parse(init.body)).toMatchObject({ digest: "2817364019", path: "/purchase-orders", message: boom.message });
  });
});
