import { describe, it, expect, vi } from "vitest";
import { ApiError } from "./api";
import { createQueryClient, loginRedirectTarget, shouldRetry } from "./query-client";

const api = (status: number) => new ApiError(`failed ${status}`, status, "X");

describe("shouldRetry", () => {
  it("never retries what a retry cannot fix: 4xx answers", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) expect(shouldRetry(0, api(status))).toBe(false);
  });

  it("retries a server or network failure twice, then stops", () => {
    for (const status of [0, 500, 502, 503, 504]) {
      expect(shouldRetry(0, api(status))).toBe(true);
      expect(shouldRetry(1, api(status))).toBe(true);
      expect(shouldRetry(2, api(status))).toBe(false);
    }
  });

  it("does not retry a cancelled request or a bug in the page", () => {
    expect(shouldRetry(0, Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
    expect(shouldRetry(0, new TypeError("x is undefined"))).toBe(false);
  });
});

describe("loginRedirectTarget", () => {
  it("returns to the page the user was on", () => {
    expect(loginRedirectTarget("/purchase-orders", "?tab=overdue")).toBe("/login?from=%2Fpurchase-orders%3Ftab%3Doverdue");
    expect(loginRedirectTarget("/", "")).toBe("/login");
  });

  it("does nothing on the sign-in page itself, so it cannot loop", () => {
    expect(loginRedirectTarget("/login", "?from=%2Fx")).toBeNull();
  });
});

describe("createQueryClient", () => {
  it("sends an expired session to sign in once, without retrying", async () => {
    const onSessionExpired = vi.fn();
    const qc = createQueryClient({ onSessionExpired, retryDelay: 0 });
    const fn = vi.fn().mockRejectedValue(api(401));
    await expect(qc.fetchQuery({ queryKey: ["a"], queryFn: fn, retry: qc.getDefaultOptions().queries!.retry })).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does the same when a write finds the session gone", async () => {
    const onSessionExpired = vi.fn();
    const qc = createQueryClient({ onSessionExpired, retryDelay: 0 });
    const m = qc.getMutationCache().build(qc, { mutationFn: () => Promise.reject(api(401)) });
    await expect(m.execute(undefined)).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 and succeeds, without treating it as a sign-out", async () => {
    const onSessionExpired = vi.fn();
    const qc = createQueryClient({ onSessionExpired, retryDelay: 0 });
    const fn = vi.fn().mockRejectedValueOnce(api(503)).mockResolvedValueOnce("ok");
    await expect(qc.fetchQuery({ queryKey: ["b"], queryFn: fn, retry: qc.getDefaultOptions().queries!.retry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("does not retry writes, so a failed post is never sent twice", () => {
    expect(createQueryClient({ onSessionExpired: () => {} }).getDefaultOptions().mutations!.retry).toBe(false);
  });
});
