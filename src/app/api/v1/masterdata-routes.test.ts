import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for master data, BOM, adjustment and settings writes:
 * every endpoint demands its permission, and bodies are validated before
 * any service runs. Services are proven in masterdata.integration.test.ts.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const md = vi.hoisted(() => ({
  createMaterial: vi.fn(), updateMaterial: vi.fn(), upsertPolicy: vi.fn(), createCategory: vi.fn(), createUnit: vi.fn(),
  createVendor: vi.fn(), updateVendor: vi.fn(), upsertVendorMaterial: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn(),
  createLocation: vi.fn(), updateLocation: vi.fn(), updateSettings: vi.fn(),
}));
const bom = vi.hoisted(() => ({ createBom: vi.fn(), createBomVersion: vi.fn(), activateBomVersion: vi.fn(), deleteBomVersion: vi.fn() }));
const adj = vi.hoisted(() => ({ adjustStock: vi.fn(), listAdjustments: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: session.resolveSession, touchSession: vi.fn() }));
vi.mock("@/server/services/master-data.service", () => md);
vi.mock("@/server/services/bom-write.service", () => bom);
vi.mock("@/server/services/inventory-adjustment.service", () => adj);
vi.mock("@/server/api/idempotency", async (orig) => ({
  ...(await orig<typeof import("@/server/api/idempotency")>()),
  runIdempotent: vi.fn().mockResolvedValue({ status: 201, body: {}, replayed: false }),
}));

import { POST as createMaterial } from "./materials/route";
import { PATCH as patchMaterial } from "./materials/[id]/route";
import { PUT as putPolicy } from "./materials/[id]/policies/[locationId]/route";
import { POST as createVendor } from "./vendors/route";
import { PATCH as patchVendor } from "./vendors/[id]/route";
import { PUT as putVendorMaterial } from "./vendors/[id]/materials/[materialId]/route";
import { POST as createCustomer } from "./customers/route";
import { PATCH as patchCustomer } from "./customers/[id]/route";
import { POST as createLocation } from "./locations/route";
import { PATCH as patchLocation } from "./locations/[id]/route";
import { POST as createBom } from "./boms/route";
import { POST as createVersion } from "./boms/[id]/versions/route";
import { POST as activate } from "./boms/[id]/versions/[versionId]/activate/route";
import { POST as adjust } from "./inventory/adjustments/route";
import { PATCH as patchSettings } from "./settings/route";

const actor = (permissions: string[]) => ({
  userId: "u1", companyId: "c1", email: "a@anvaya.in", name: "A", sessionId: "s1", roles: [], permissions: new Set(permissions),
});
const req = (path: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method, headers: { cookie: "anvaya.session=t", "content-type": "application/json" }, body: JSON.stringify(body),
  });
const id = { params: { id: "x", locationId: "l", materialId: "m", versionId: "v" } };

const material = { code: "RM-1", name: "R", kind: "RAW", unitOfMeasureId: "kg" };
const policy = { procurementType: "BUY" };
const version = { version: "B", baseQuantity: 1, effectiveFrom: "2026-01-01", components: [{ materialId: "m", quantity: 1 }] };

const cases = [
  ["POST /materials", "material:create", () => createMaterial(req("/materials", "POST", material))],
  ["PATCH /materials/:id", "material:update", () => patchMaterial(req("/materials/x", "PATCH", { name: "N" }), id)],
  ["PUT policy", "material:update", () => putPolicy(req("/materials/x/policies/l", "PUT", policy), id)],
  ["POST /vendors", "vendor:create", () => createVendor(req("/vendors", "POST", { code: "V1", name: "V" }))],
  ["PATCH /vendors/:id", "vendor:update", () => patchVendor(req("/vendors/x", "PATCH", { isApproved: true }), id)],
  ["PUT vendor material", "vendor:update", () => putVendorMaterial(req("/vendors/x/materials/m", "PUT", { leadTimeDays: 5 }), id)],
  ["POST /customers", "customer:create", () => createCustomer(req("/customers", "POST", { code: "C1", name: "C" }))],
  ["PATCH /customers/:id", "customer:update", () => patchCustomer(req("/customers/x", "PATCH", { name: "C" }), id)],
  ["POST /locations", "location:create", () => createLocation(req("/locations", "POST", { code: "L1", name: "L", type: "DEPOT" }))],
  ["PATCH /locations/:id", "location:update", () => patchLocation(req("/locations/x", "PATCH", { name: "L" }), id)],
  ["POST /boms", "bom:create", () => createBom(req("/boms", "POST", { materialId: "m", code: "B1", name: "B" }))],
  ["POST versions", "bom:update", () => createVersion(req("/boms/x/versions", "POST", version), id)],
  ["POST activate", "bom:update", () => activate(req("/boms/x/versions/v/activate", "POST", {}), id)],
  ["POST adjustments", "inventory:adjust", () => adjust(req("/inventory/adjustments", "POST", { materialId: "m", locationId: "l", countedQty: 1, reason: "LOSS" }))],
  ["PATCH /settings", "setting:update", () => patchSettings(req("/settings", "PATCH", { "sales.overDispatchTolerancePct": 2 }))],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  md.createMaterial.mockResolvedValue({ id: "m1", code: "RM-1" });
  md.createVendor.mockResolvedValue({ id: "v1" });
  md.createCustomer.mockResolvedValue({ id: "c1" });
  md.createLocation.mockResolvedValue({ id: "l1" });
  bom.createBom.mockResolvedValue({ id: "b1" });
  bom.createBomVersion.mockResolvedValue({ id: "v1", version: "B" });
});

describe("permissions", () => {
  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["material:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });

  it.each(cases)("%s succeeds with %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor([permission]));
    expect((await call()).status).toBeLessThan(300);
  });
});

describe("validation", () => {
  beforeEach(() => session.resolveSession.mockResolvedValue(actor(["material:create", "material:update", "vendor:update"])));

  it("normalises codes and rejects malformed ones", async () => {
    await createMaterial(req("/materials", "POST", { ...material, code: " rm-9 " }));
    expect(md.createMaterial.mock.calls[0][0].code).toBe("RM-9");
    expect((await createMaterial(req("/materials", "POST", { ...material, code: "has space" }))).status).toBe(422);
  });

  it("rejects inconsistent planning policies", async () => {
    const res = await putPolicy(req("/materials/x/policies/l", "PUT", { procurementType: "BUY", safetyStock: 50, reorderPoint: 10, minOrderQty: 5, maxOrderQty: 2 }), id);
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.map((d: { path: string }) => d.path).sort()).toEqual(["maxOrderQty", "reorderPoint"]);
  });

  it("rejects an invalid vendor price and lead time", async () => {
    expect((await putVendorMaterial(req("/vendors/x/materials/m", "PUT", { leadTimeDays: -1, unitPrice: -5 }), id)).status).toBe(422);
  });
});
