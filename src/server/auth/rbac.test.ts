import { describe, it, expect } from "vitest";
import {
  hasPermission, hasAnyPermission, hasAllPermissions,
  requirePermission, requireAnyPermission, requireAuthenticated,
  requireSameCompany, toPublicActor,
} from "./rbac";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "./session";

const actor = (permissions: string[], companyId = "co-1"): Actor => ({
  userId: "u-1",
  companyId,
  email: "planner@anvaya.in",
  name: "Vikram Thakur",
  sessionId: "s-1",
  roles: ["PLANNER"],
  permissions: new Set(permissions),
});

describe("permission checks", () => {
  const planner = actor(["material:read", "mrp:read", "mrp:run"]);

  it("reports held and missing permissions", () => {
    expect(hasPermission(planner, "mrp:run")).toBe(true);
    expect(hasPermission(planner, "material:delete")).toBe(false);
  });

  it("treats a missing actor as holding nothing", () => {
    expect(hasPermission(null, "mrp:run")).toBe(false);
    expect(hasAnyPermission(null, ["mrp:run"])).toBe(false);
    expect(hasAllPermissions(null, [])).toBe(true); // vacuously true
  });

  it("handles any/all correctly", () => {
    expect(hasAnyPermission(planner, ["material:delete", "mrp:run"])).toBe(true);
    expect(hasAnyPermission(planner, ["material:delete", "user:create"])).toBe(false);
    expect(hasAllPermissions(planner, ["mrp:read", "mrp:run"])).toBe(true);
    expect(hasAllPermissions(planner, ["mrp:run", "user:create"])).toBe(false);
  });
});

describe("requirePermission", () => {
  const planner = actor(["mrp:run"]);

  it("passes when the permission is held", () => {
    expect(() => requirePermission(planner, "mrp:run")).not.toThrow();
  });

  it("throws 403 naming the missing permission", () => {
    try {
      requirePermission(planner, "purchase-order:approve");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(AppError.is(e)).toBe(true);
      expect((e as AppError).status).toBe(403);
      expect((e as AppError).message).toContain("purchase-order:approve");
    }
  });

  it("throws 401, not 403, when there is no actor at all", () => {
    // The distinction matters: 401 means "sign in", 403 means "you cannot".
    try {
      requirePermission(null, "mrp:run");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AppError).status).toBe(401);
    }
  });

  it("requireAnyPermission accepts one of several", () => {
    expect(() => requireAnyPermission(planner, ["mrp:run", "user:create"])).not.toThrow();
    expect(() => requireAnyPermission(planner, ["user:create"])).toThrow();
  });

  it("requireAuthenticated rejects only a null actor", () => {
    expect(() => requireAuthenticated(planner)).not.toThrow();
    expect(() => requireAuthenticated(null)).toThrow();
  });
});

describe("tenant isolation", () => {
  const mine = actor(["material:read"], "co-1");

  it("allows access within the same company", () => {
    expect(() => requireSameCompany(mine, "co-1", "Material")).not.toThrow();
  });

  it("reports another company's record as not found, not forbidden", () => {
    // 403 would confirm the record exists in a company the caller cannot see,
    // which is itself a leak.
    try {
      requireSameCompany(mine, "co-2", "Material");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as AppError).status).toBe(404);
      expect((e as AppError).message).toContain("Material");
    }
  });
});

describe("toPublicActor", () => {
  it("serialises permissions as a sorted array", () => {
    const pub = toPublicActor(actor(["mrp:run", "bom:read", "material:read"]));
    expect(pub.permissions).toEqual(["bom:read", "material:read", "mrp:run"]);
    expect(pub.email).toBe("planner@anvaya.in");
    expect(pub.roles).toEqual(["PLANNER"]);
  });

  it("never exposes the session id", () => {
    // The session id is not the token, but it is not the client's business
    // either, and leaking it invites confusion with the credential.
    expect(JSON.stringify(toPublicActor(actor([])))).not.toContain("s-1");
  });
});
