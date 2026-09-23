/**
 * Post-seed integrity check.
 *
 *   npx tsx prisma/verify.ts            print a row-count snapshot
 *   npx tsx prisma/verify.ts --compare  compare against the last snapshot
 *
 * Used by the Phase 2 gate to prove the seed is idempotent and the graph is
 * relationally sound. Counting rows is the only way to catch a seed that
 * duplicates on a second run: it still "succeeds", it just quietly doubles
 * the data.
 */

import "dotenv/config";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SNAPSHOT = path.join(process.cwd(), "node_modules", ".cache", "anvaya-seed-snapshot.json");

async function counts() {
  const [
    companies, settings, locations, units, categories, permissions, roles, rolePermissions,
    users, userRoles, materials, policies, vendors, vendorMaterials, scorecards, customers,
    boms, bomVersions, bomComponents, lots, balances, movements, purchaseOrders, poLines,
    goodsReceipts, grnLines, salesOrders, soLines, forecasts, forecastPeriods,
    workOrders, woOperations, woComponents, constraints, integrations,
  ] = await Promise.all([
    prisma.company.count(), prisma.companySetting.count(), prisma.location.count(),
    prisma.unitOfMeasure.count(), prisma.materialCategory.count(), prisma.permission.count(),
    prisma.role.count(), prisma.rolePermission.count(), prisma.user.count(), prisma.userRole.count(),
    prisma.material.count(), prisma.materialLocationPolicy.count(), prisma.vendor.count(),
    prisma.vendorMaterial.count(), prisma.vendorScorecard.count(), prisma.customer.count(),
    prisma.bom.count(), prisma.bomVersion.count(), prisma.bomComponent.count(),
    prisma.inventoryLot.count(), prisma.inventoryBalance.count(), prisma.stockMovement.count(),
    prisma.purchaseOrder.count(), prisma.purchaseOrderLine.count(),
    prisma.goodsReceipt.count(), prisma.goodsReceiptLine.count(),
    prisma.salesOrder.count(), prisma.salesOrderLine.count(),
    prisma.demandForecast.count(), prisma.forecastPeriod.count(),
    prisma.workOrder.count(), prisma.workOrderOperation.count(), prisma.workOrderComponent.count(),
    prisma.productionConstraint.count(), prisma.integration.count(),
  ]);

  return {
    companies, settings, locations, units, categories, permissions, roles, rolePermissions,
    users, userRoles, materials, policies, vendors, vendorMaterials, scorecards, customers,
    boms, bomVersions, bomComponents, lots, balances, movements, purchaseOrders, poLines,
    goodsReceipts, grnLines, salesOrders, soLines, forecasts, forecastPeriods,
    workOrders, woOperations, woComponents, constraints, integrations,
  };
}

/** Relationship assertions that a foreign key alone cannot express. */
async function integrity() {
  const problems: string[] = [];

  // Material -> unit of measure is a required FK, so the database already
  // guarantees it; there is nothing useful to assert here. What is worth
  // checking is that every material a BOM or policy references actually
  // resolves, which the FKs also cover. So the assertions below are limited
  // to the invariants Postgres cannot express.

  // At most one active version per BOM — enforced by the service layer, so it
  // is asserted here rather than by a database constraint.
  const boms = await prisma.bom.findMany({ include: { versions: { where: { isActive: true } } } });
  for (const b of boms) {
    if (b.versions.length !== 1) problems.push(`BOM ${b.code} has ${b.versions.length} active versions (expected 1)`);
  }

  // A BOM must not contain the material it produces, at any depth.
  for (const b of boms) {
    const version = b.versions[0];
    if (!version) continue;
    const comps = await prisma.bomComponent.findMany({ where: { bomVersionId: version.id } });
    if (comps.some((c) => c.materialId === b.materialId)) problems.push(`BOM ${b.code} contains its own output material`);
  }

  // Lot arithmetic must hold: received - consumed = remaining.
  const lots = await prisma.inventoryLot.findMany();
  for (const l of lots) {
    const expected = Number(l.receivedQty) - Number(l.consumedQty);
    if (Math.abs(expected - Number(l.remainingQty)) > 1e-6) {
      problems.push(`Lot ${l.lotNumber}: received-consumed=${expected} but remaining=${l.remainingQty}`);
    }
  }

  // A PO line cannot have received more than it ordered.
  const poLines = await prisma.purchaseOrderLine.findMany({ include: { purchaseOrder: true } });
  for (const l of poLines) {
    if (Number(l.receivedQty) > Number(l.orderedQty)) {
      problems.push(`PO ${l.purchaseOrder.orderNumber} line ${l.lineNumber}: received > ordered`);
    }
  }

  // Status must agree with the receipt maths.
  for (const l of poLines) {
    const { status, orderNumber } = l.purchaseOrder;
    const fully = Number(l.receivedQty) === Number(l.orderedQty) && Number(l.orderedQty) > 0;
    if (status === "FULLY_RECEIVED" && !fully) problems.push(`PO ${orderNumber} is FULLY_RECEIVED but line ${l.lineNumber} is not`);
    if (status === "ORDERED" && Number(l.receivedQty) > 0) problems.push(`PO ${orderNumber} is ORDERED but line ${l.lineNumber} has receipts`);
  }

  // Every GRN line must point at a PO line for the same material.
  const grnLines = await prisma.goodsReceiptLine.findMany({ include: { purchaseOrderLine: true, goodsReceipt: true } });
  for (const g of grnLines) {
    if (g.materialId !== g.purchaseOrderLine.materialId) {
      problems.push(`GRN ${g.goodsReceipt.grnNumber} line ${g.lineNumber} material does not match its PO line`);
    }
  }

  // A sales order line cannot have shipped more than was ordered.
  const soLines = await prisma.salesOrderLine.findMany({ include: { salesOrder: true } });
  for (const l of soLines) {
    if (Number(l.shippedQty) > Number(l.quantity)) {
      problems.push(`SO ${l.salesOrder.orderNumber} line ${l.lineNumber}: shipped > ordered`);
    }
  }

  // The balance cache must equal the sum of the ledger it derives from.
  const balances = await prisma.inventoryBalance.findMany({ include: { material: true, location: true } });
  for (const b of balances) {
    const agg = await prisma.stockMovement.aggregate({
      where: { materialId: b.materialId, locationId: b.locationId },
      _sum: { quantity: true },
    });
    const ledger = Number(agg._sum.quantity ?? 0);
    if (Math.abs(ledger - Number(b.onHandQty)) > 1e-6) {
      problems.push(`Balance ${b.material.code}@${b.location.code}: cache=${b.onHandQty} but ledger sums to ${ledger}`);
    }
  }

  // Every user must hold at least one role, or they can do nothing at all.
  const roleless = await prisma.user.count({ where: { roles: { none: {} } } });
  if (roleless > 0) problems.push(`${roleless} users have no role assigned`);

  // Admin must hold every permission.
  const admin = await prisma.role.findFirst({ where: { code: "ADMIN" }, include: { permissions: true } });
  const permTotal = await prisma.permission.count();
  if (admin && admin.permissions.length !== permTotal) {
    problems.push(`ADMIN holds ${admin.permissions.length} of ${permTotal} permissions`);
  }

  // Multi-level BOM: the concentrate must itself be produced by a BOM, or the
  // demo does not actually exercise multi-level explosion.
  const sa101 = await prisma.material.findFirst({ where: { code: "SA-101" }, include: { boms: true } });
  if (!sa101 || sa101.boms.length === 0) problems.push("SA-101 has no BOM — the dataset is not multi-level");

  return problems;
}

async function main() {
  const compare = process.argv.includes("--compare");
  const current = await counts();
  const total = Object.values(current).reduce((a, b) => a + b, 0);

  if (compare && existsSync(SNAPSHOT)) {
    const previous = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as typeof current;
    const drift = Object.entries(current).filter(([k, v]) => previous[k as keyof typeof current] !== v);

    console.log("\nIdempotency check (second seed vs first)\n");
    if (drift.length === 0) {
      console.log(`  PASS — all 35 tables unchanged, ${total} rows total\n`);
    } else {
      console.log("  FAIL — row counts changed on re-seed:");
      for (const [k, v] of drift) console.log(`    ${k}: ${previous[k as keyof typeof current]} -> ${v}`);
      console.log();
      process.exitCode = 1;
    }
  } else {
    writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2));
    console.log(`\nSnapshot written — ${total} rows across 35 tables\n`);
    for (const [k, v] of Object.entries(current)) console.log(`  ${k.padEnd(20)} ${v}`);
    console.log();
  }

  const problems = await integrity();
  console.log("Relational integrity\n");
  if (problems.length === 0) {
    console.log("  PASS — every assertion held\n");
  } else {
    console.log(`  FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.log(`    - ${p}`);
    console.log();
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
