import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for user and role administration, the forced password
 * change gate, and sliding session expiry.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
  process.env.SESSION_MAX_AGE_SECONDS = "3600";
  process.env.SESSION_ABSOLUTE_MAX_SECONDS = "7200";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const admin = vi.hoisted(() => ({
  listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn(), unlockUser: vi.fn(),
  listRoles: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn(), listPermissions: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/server/auth/session")>()),
  resolveSession: session.resolveSession, touchSession: vi.fn(),
}));
vi.mock("@/server/services/user-admin.service", () => admin);
vi.mock("@/server/services/purchase-order.service", () => ({ listPurchaseOrders: vi.fn().mockResolvedValue({ orders: [] }) }));

import { GET as listUsers, POST as createUser } from "./users/route";
import { PATCH as patchUser } from "./users/[id]/route";
import { POST as resetPassword } from "./users/[id]/reset-password/route";
import { GET as listRoles, POST as createRole } from "./roles/route";
import { GET as listPermissions } from "./permissions/route";
import { GET as listPOs } from "./purchase-orders/route";
import { GET as me } from "./auth/me/route";
import { slidingExpiry } from "@/server/auth/session";

const actor = (permissions: string[], over: Record<string, unknown> = {}) => ({
  userId: "u1", companyId: "c1", email: "a@anvaya.in", name: "Admin", sessionId: "s1", roles: ["ADMIN"],
  permissions: new Set(permissions), ...over,
});
const request = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method,
    headers: { cookie: "anvaya.session=t", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const p = { params: { id: "u2" } };

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["user:read", "user:create", "user:update", "role:read", "role:create", "purchase-order:read"]));
  admin.createUser.mockResolvedValue({ user: { id: "u2", email: "n@x.in", name: "N" }, temporaryPassword: "Tmp-abc" });
  admin.resetUserPassword.mockResolvedValue({ temporaryPassword: "Tmp-xyz" });
  admin.listUsers.mockResolvedValue([]);
  admin.listRoles.mockResolvedValue([]);
  admin.listPermissions.mockResolvedValue([]);
  admin.createRole.mockResolvedValue({ id: "r1", code: "X" });
});

describe("permissions", () => {
  const cases = [
    ["GET /users", "user:read", () => listUsers(request("/users"))],
    ["POST /users", "user:create", () => createUser(request("/users", "POST", { email: "n@x.in", name: "N", roleIds: ["r"] }))],
    ["PATCH /users/:id", "user:update", () => patchUser(request("/users/u2", "PATCH", { name: "X" }), p)],
    ["POST reset-password", "user:update", () => resetPassword(request("/users/u2/reset-password", "POST", {}), p)],
    ["GET /roles", "role:read", () => listRoles(request("/roles"))],
    ["POST /roles", "role:create", () => createRole(request("/roles", "POST", { code: "QA", name: "QA", permissions: ["material:read"] }))],
    ["GET /permissions", "role:read", () => listPermissions(request("/permissions"))],
  ] as const;

  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["material:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });
});

describe("temporary passwords", () => {
  it("are returned once, never cached", async () => {
    const res = await createUser(request("/users", "POST", { email: "N@X.in", name: "N", roleIds: ["r"] }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data.temporaryPassword).toBe("Tmp-abc");
    // Emails are normalised before they reach the service.
    expect(admin.createUser.mock.calls[0][0].email).toBe("n@x.in");

    const reset = await resetPassword(request("/users/u2/reset-password", "POST", {}), p);
    expect(reset.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a chosen password that breaks the policy", async () => {
    const res = await createUser(request("/users", "POST", { email: "n@x.in", name: "N", roleIds: ["r"], password: "short" }));
    expect(res.status).toBe(422);
  });
});

describe("forced password change", () => {
  it("blocks everything but /auth/me while an issued password is unchanged", async () => {
    session.resolveSession.mockResolvedValue(actor(["purchase-order:read"], { mustChangePassword: true }));
    const blocked = await listPOs(request("/purchase-orders"));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.message).toMatch(/set a new password/);

    const ok = await me(request("/auth/me"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.user.mustChangePassword).toBe(true);
  });
});

describe("slidingExpiry", () => {
  it("extends to the idle window from now, capped by the absolute maximum", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    // 1h idle window, 2h absolute cap (set above).
    expect(slidingExpiry(new Date("2026-01-01T00:30:00Z"), created).toISOString()).toBe("2026-01-01T01:30:00.000Z");
    expect(slidingExpiry(new Date("2026-01-01T01:30:00Z"), created).toISOString()).toBe("2026-01-01T02:00:00.000Z");
  });
});
