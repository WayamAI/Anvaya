/**
 * Seed the demo dataset.
 *
 *   npm run db:seed
 *
 * Idempotent by construction: every write is an upsert keyed on the row's
 * business key, so running it twice produces exactly the same database as
 * running it once. That matters because the seed is how a developer resets
 * their environment, and a seed that duplicates on the second run is worse
 * than no seed at all.
 *
 * Stock is the one thing that cannot simply be upserted — it is a ledger, and
 * replaying receipts would double the balances. The opening position is
 * therefore reset and rebuilt as a single opening movement per material and
 * location, which keeps the ledger and the balance cache consistent.
 */

import "dotenv/config";
import { PrismaClient, Prisma, StockMovementType, MaterialKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

import {
  COMPANY, LOCATIONS, UNITS, CATEGORY_PARENTS, CATEGORIES, MATERIALS,
  BOM_FG001, BOM_SA101, POLICIES_PUNE, VENDORS, CUSTOMERS,
  PERMISSIONS, ROLES, USERS,
} from "./seed/master-data";
import {
  AS_OF_DATE, BALANCES, LOTS, PURCHASE_ORDERS, GOODS_RECEIPTS,
  SALES_ORDERS, FORECASTS, WORK_ORDERS, CONSTRAINTS, INTEGRATIONS, SETTINGS,
} from "./seed/operational-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Dates are stored as DATE columns; parse at UTC midnight to avoid drift. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dec = (n: number) => new Prisma.Decimal(n);

const step = (label: string) => process.stdout.write(`  ${label.padEnd(44, ".")} `);
const done = (n: number | string) => console.log(String(n));

async function main() {
  const started = Date.now();
  console.log(`\nSeeding Anvaya demo data (as-of ${AS_OF_DATE})\n`);

  // -- Company ------------------------------------------------------------
  step("company");
  const company = await prisma.company.upsert({
    where: { code: COMPANY.code },
    update: { name: COMPANY.name, legalName: COMPANY.legalName },
    create: { ...COMPANY },
  });
  done(company.name);

  // -- Settings -----------------------------------------------------------
  step("company settings");
  for (const s of SETTINGS) {
    await prisma.companySetting.upsert({
      where: { companyId_namespace_key: { companyId: company.id, namespace: s.namespace, key: s.key } },
      update: { value: s.value as Prisma.InputJsonValue, description: s.description },
      create: { companyId: company.id, namespace: s.namespace, key: s.key, value: s.value as Prisma.InputJsonValue, description: s.description },
    });
  }
  done(SETTINGS.length);

  // -- Locations ----------------------------------------------------------
  step("locations");
  const locationId = new Map<string, string>();
  for (const l of LOCATIONS) {
    const row = await prisma.location.upsert({
      where: { companyId_code: { companyId: company.id, code: l.code } },
      update: { name: l.name, type: l.type, city: l.city, state: l.state, isManufacturing: l.isManufacturing },
      create: { companyId: company.id, ...l },
    });
    locationId.set(l.code, row.id);
  }
  done(locationId.size);

  // -- Units of measure ---------------------------------------------------
  step("units of measure");
  const uomId = new Map<string, string>();
  for (const u of UNITS) {
    const row = await prisma.unitOfMeasure.upsert({
      where: { companyId_code: { companyId: company.id, code: u.code } },
      update: { name: u.name, dimension: u.dimension },
      create: { companyId: company.id, ...u },
    });
    uomId.set(u.code, row.id);
  }
  done(uomId.size);

  // -- Categories (parents first, so children can reference them) ---------
  step("material categories");
  const categoryId = new Map<string, string>();
  for (const c of CATEGORY_PARENTS) {
    const row = await prisma.materialCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      update: { name: c.name },
      create: { companyId: company.id, code: c.code, name: c.name },
    });
    categoryId.set(c.code, row.id);
  }
  for (const c of CATEGORIES) {
    const row = await prisma.materialCategory.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      update: { name: c.name, parentId: categoryId.get(c.parent) },
      create: { companyId: company.id, code: c.code, name: c.name, parentId: categoryId.get(c.parent) },
    });
    categoryId.set(c.code, row.id);
  }
  done(categoryId.size);

  // -- Permissions and roles ----------------------------------------------
  step("permissions");
  const permissionId = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const [resource, action] = p.code.split(":");
    const row = await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, resource, action },
      create: { code: p.code, resource, action, description: p.description },
    });
    permissionId.set(p.code, row.id);
  }
  done(permissionId.size);

  step("roles");
  const roleId = new Map<string, string>();
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { companyId_code: { companyId: company.id, code: r.code } },
      update: { name: r.name, description: r.description, isSystem: r.isSystem },
      create: { companyId: company.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem },
    });
    roleId.set(r.code, row.id);

    const codes = r.permissions === "*" ? [...permissionId.keys()] : r.permissions;
    // Replace rather than merge, so removing a permission from the catalogue
    // above actually revokes it on a re-seed.
    await prisma.rolePermission.deleteMany({ where: { roleId: row.id } });
    await prisma.rolePermission.createMany({
      data: codes.map((c) => ({ roleId: row.id, permissionId: permissionId.get(c)! })),
      skipDuplicates: true,
    });
  }
  done(roleId.size);

  // -- Users --------------------------------------------------------------
  step("users");
  const password = process.env.SEED_USER_PASSWORD ?? "Anvaya!Demo2026";
  // Hashed once: argon2 is intentionally slow, and every demo user shares the
  // same demo password.
  const passwordHash = await hash(password);
  const userId = new Map<string, string>();
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email: u.email } },
      update: { name: u.name, passwordHash, isActive: true },
      create: { companyId: company.id, email: u.email, name: u.name, passwordHash },
    });
    userId.set(u.email, row.id);
    await prisma.userRole.deleteMany({ where: { userId: row.id } });
    await prisma.userRole.create({ data: { userId: row.id, roleId: roleId.get(u.role)! } });
  }
  done(userId.size);

  // -- Materials ----------------------------------------------------------
  step("materials");
  const materialId = new Map<string, string>();
  for (const m of MATERIALS) {
    const row = await prisma.material.upsert({
      where: { companyId_code: { companyId: company.id, code: m.code } },
      update: {
        name: m.name, kind: m.kind, categoryId: categoryId.get(m.category),
        unitOfMeasureId: uomId.get(m.uom)!, standardCost: dec(m.standardCost),
        shelfLifeDays: m.shelfLifeDays ?? null, isBatchTracked: m.isBatchTracked,
      },
      create: {
        companyId: company.id, code: m.code, name: m.name, kind: m.kind,
        categoryId: categoryId.get(m.category), unitOfMeasureId: uomId.get(m.uom)!,
        standardCost: dec(m.standardCost), shelfLifeDays: m.shelfLifeDays ?? null,
        isBatchTracked: m.isBatchTracked,
      },
    });
    materialId.set(m.code, row.id);
  }
  done(materialId.size);

  // -- Planning policy ----------------------------------------------------
  step("material/location policies");
  for (const p of POLICIES_PUNE) {
    const key = { materialId: materialId.get(p.material)!, locationId: locationId.get(p.location)! };
    const data = {
      procurementType: p.procurementType,
      safetyStock: dec(p.safetyStock), reorderPoint: dec(p.reorderPoint),
      lotSizingRule: p.lotSizingRule, minOrderQty: dec(p.minOrderQty), orderMultiple: dec(p.orderMultiple),
      productionLeadTimeDays: p.productionLeadTimeDays,
      averageDailyDemand: p.averageDailyDemand ? dec(p.averageDailyDemand) : null,
      demandStdDev: p.demandStdDev ? dec(p.demandStdDev) : null,
      serviceLevel: p.serviceLevel ? dec(p.serviceLevel) : null,
      abcClass: p.abcClass ?? null,
    };
    await prisma.materialLocationPolicy.upsert({
      where: { materialId_locationId: key },
      update: data,
      create: { ...key, ...data },
    });
  }
  done(POLICIES_PUNE.length);

  // -- Vendors ------------------------------------------------------------
  step("vendors + supplied materials");
  const vendorId = new Map<string, string>();
  let vendorMaterialCount = 0;
  for (const v of VENDORS) {
    const row = await prisma.vendor.upsert({
      where: { companyId_code: { companyId: company.id, code: v.code } },
      update: { name: v.name, vendorCode: v.vendorCode, city: v.city, contactPerson: v.contactPerson, contactEmail: v.contactEmail, paymentTerms: v.paymentTerms, isApproved: v.isApproved },
      create: { companyId: company.id, code: v.code, vendorCode: v.vendorCode, name: v.name, city: v.city, contactPerson: v.contactPerson, contactEmail: v.contactEmail, paymentTerms: v.paymentTerms, isApproved: v.isApproved },
    });
    vendorId.set(v.code, row.id);

    for (const vm of v.materials) {
      await prisma.vendorMaterial.upsert({
        where: { vendorId_materialId: { vendorId: row.id, materialId: materialId.get(vm.material)! } },
        update: { leadTimeDays: vm.leadTimeDays, unitPrice: dec(vm.unitPrice), minOrderQty: dec(vm.minOrderQty), isPreferred: vm.isPreferred },
        create: { vendorId: row.id, materialId: materialId.get(vm.material)!, leadTimeDays: vm.leadTimeDays, unitPrice: dec(vm.unitPrice), minOrderQty: dec(vm.minOrderQty), isPreferred: vm.isPreferred },
      });
      vendorMaterialCount++;
    }

    const sc = v.scorecard;
    await prisma.vendorScorecard.upsert({
      where: { vendorId_periodStart_periodEnd: { vendorId: row.id, periodStart: d("2026-01-01"), periodEnd: d("2026-03-31") } },
      update: { defectRatePercent: dec(sc.defectRatePercent), onTimeDeliveryPercent: dec(sc.onTimeDeliveryPercent), copqAmount: dec(sc.copqAmount), lastAuditDate: d(sc.lastAuditDate), auditResult: sc.auditResult },
      create: { vendorId: row.id, periodStart: d("2026-01-01"), periodEnd: d("2026-03-31"), defectRatePercent: dec(sc.defectRatePercent), onTimeDeliveryPercent: dec(sc.onTimeDeliveryPercent), copqAmount: dec(sc.copqAmount), lastAuditDate: d(sc.lastAuditDate), auditResult: sc.auditResult },
    });
  }
  done(`${vendorId.size} vendors / ${vendorMaterialCount} supplied materials`);

  // -- Customers ----------------------------------------------------------
  step("customers");
  const customerId = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const row = await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      update: { name: c.name, type: c.type, city: c.city, paymentTerms: c.paymentTerms },
      create: { companyId: company.id, ...c },
    });
    customerId.set(c.code, row.id);
  }
  done(customerId.size);

  // -- BOMs ---------------------------------------------------------------
  step("bills of material");
  let componentCount = 0;
  for (const b of [BOM_FG001, BOM_SA101]) {
    const bom = await prisma.bom.upsert({
      where: { companyId_code: { companyId: company.id, code: b.code } },
      update: { name: b.name, materialId: materialId.get(b.material)! },
      create: { companyId: company.id, code: b.code, name: b.name, materialId: materialId.get(b.material)! },
    });

    const version = await prisma.bomVersion.upsert({
      where: { bomId_version: { bomId: bom.id, version: b.version } },
      update: { baseQuantity: dec(b.baseQuantity), isActive: true, effectiveFrom: d("2026-01-01") },
      create: { bomId: bom.id, version: b.version, baseQuantity: dec(b.baseQuantity), isActive: true, effectiveFrom: d("2026-01-01") },
    });

    // Rebuilt rather than merged, so removing a line from the definition
    // above actually removes it from the BOM on a re-seed.
    await prisma.bomComponent.deleteMany({ where: { bomVersionId: version.id } });
    await prisma.bomComponent.createMany({
      data: b.components.map((c, i) => ({
        bomVersionId: version.id,
        materialId: materialId.get(c.material)!,
        position: (i + 1) * 10,
        quantity: dec(c.quantity),
        unitOfMeasureId: uomId.get(c.uom)!,
        scrapFactor: dec(c.scrapFactor),
      })),
    });
    componentCount += b.components.length;
  }
  done(`2 BOMs / ${componentCount} components`);

  // -- Inventory lots -----------------------------------------------------
  step("inventory lots");
  const lotId = new Map<string, string>();
  for (const l of LOTS) {
    const remaining = l.receivedQty - l.consumedQty;
    const row = await prisma.inventoryLot.upsert({
      where: { materialId_lotNumber: { materialId: materialId.get(l.material)!, lotNumber: l.lotNumber } },
      update: {
        locationId: locationId.get(l.location)!, vendorId: l.vendor ? vendorId.get(l.vendor) : null,
        supplierLotNumber: l.supplierLotNumber ?? null,
        receivedQty: dec(l.receivedQty), consumedQty: dec(l.consumedQty), remainingQty: dec(remaining),
        receiptDate: d(l.receiptDate), expiryDate: l.expiryDate ? d(l.expiryDate) : null,
        qcStatus: l.qcStatus, coaReference: l.coaReference ?? null,
        storageLocation: l.storageLocation ?? null, bin: l.bin ?? null,
      },
      create: {
        materialId: materialId.get(l.material)!, lotNumber: l.lotNumber,
        locationId: locationId.get(l.location)!, vendorId: l.vendor ? vendorId.get(l.vendor) : null,
        supplierLotNumber: l.supplierLotNumber ?? null,
        receivedQty: dec(l.receivedQty), consumedQty: dec(l.consumedQty), remainingQty: dec(remaining),
        receiptDate: d(l.receiptDate), expiryDate: l.expiryDate ? d(l.expiryDate) : null,
        qcStatus: l.qcStatus, coaReference: l.coaReference ?? null,
        storageLocation: l.storageLocation ?? null, bin: l.bin ?? null,
      },
    });
    lotId.set(l.lotNumber, row.id);
  }
  done(lotId.size);

  // -- Opening stock ------------------------------------------------------
  //
  // The ledger is rebuilt rather than appended to. Replaying the opening
  // receipts on a re-seed would otherwise double every balance — the one
  // place a naive upsert would silently corrupt the data.
  step("opening stock (ledger + balances)");
  await prisma.stockMovement.deleteMany({ where: { referenceType: "SEED_OPENING" } });
  for (const b of BALANCES) {
    const key = { materialId: materialId.get(b.material)!, locationId: locationId.get(b.location)! };
    const material = MATERIALS.find((m) => m.code === b.material)!;
    const valuation = dec(b.onHandQty * material.standardCost);

    await prisma.stockMovement.create({
      data: {
        ...key, type: StockMovementType.RECEIPT,
        quantity: dec(b.onHandQty), unitCost: dec(material.standardCost),
        balanceAfter: dec(b.onHandQty),
        referenceType: "SEED_OPENING", referenceId: `${b.material}@${b.location}`,
        occurredAt: d(AS_OF_DATE), notes: "Opening balance loaded by seed",
      },
    });

    const data = {
      onHandQty: dec(b.onHandQty),
      reservedQty: dec(b.reservedQty ?? 0),
      quarantineQty: dec(b.quarantineQty ?? 0),
      valuation,
      lastMovementAt: d(AS_OF_DATE),
    };
    await prisma.inventoryBalance.upsert({
      where: { materialId_locationId: key },
      update: data,
      create: { ...key, ...data },
    });
  }
  done(BALANCES.length);

  // -- Purchase orders ----------------------------------------------------
  step("purchase orders");
  const buyer = userId.get("procurement@anvaya.in")!;
  const poLineId = new Map<string, string>();
  for (const po of PURCHASE_ORDERS) {
    const total = po.lines.reduce((s, l) => s + l.orderedQty * l.unitPrice, 0);
    const header = await prisma.purchaseOrder.upsert({
      where: { companyId_orderNumber: { companyId: company.id, orderNumber: po.orderNumber } },
      update: {
        vendorId: vendorId.get(po.vendor)!, locationId: locationId.get(po.location)!,
        orderDate: d(po.orderDate), expectedDeliveryDate: d(po.expectedDeliveryDate),
        status: po.status, totalAmount: dec(total),
      },
      create: {
        companyId: company.id, orderNumber: po.orderNumber,
        vendorId: vendorId.get(po.vendor)!, locationId: locationId.get(po.location)!,
        orderDate: d(po.orderDate), expectedDeliveryDate: d(po.expectedDeliveryDate),
        status: po.status, totalAmount: dec(total), createdById: buyer,
      },
    });

    for (const [i, l] of po.lines.entries()) {
      const line = await prisma.purchaseOrderLine.upsert({
        where: { purchaseOrderId_lineNumber: { purchaseOrderId: header.id, lineNumber: i + 1 } },
        update: {
          materialId: materialId.get(l.material)!, orderedQty: dec(l.orderedQty), receivedQty: dec(l.receivedQty),
          unitPrice: dec(l.unitPrice), lineTotal: dec(l.orderedQty * l.unitPrice), expectedDeliveryDate: d(po.expectedDeliveryDate),
        },
        create: {
          purchaseOrderId: header.id, lineNumber: i + 1, materialId: materialId.get(l.material)!,
          orderedQty: dec(l.orderedQty), receivedQty: dec(l.receivedQty),
          unitPrice: dec(l.unitPrice), lineTotal: dec(l.orderedQty * l.unitPrice), expectedDeliveryDate: d(po.expectedDeliveryDate),
        },
      });
      poLineId.set(`${po.orderNumber}:${l.material}`, line.id);
    }
  }
  done(PURCHASE_ORDERS.length);

  // -- Goods receipts -----------------------------------------------------
  step("goods receipts");
  for (const grn of GOODS_RECEIPTS) {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { companyId_orderNumber: { companyId: company.id, orderNumber: grn.purchaseOrder } },
    });
    const header = await prisma.goodsReceipt.upsert({
      where: { companyId_grnNumber: { companyId: company.id, grnNumber: grn.grnNumber } },
      update: { receiptDate: d(grn.receiptDate) },
      create: {
        companyId: company.id, grnNumber: grn.grnNumber, purchaseOrderId: po.id,
        vendorId: vendorId.get(grn.vendor)!, locationId: locationId.get(grn.location)!,
        receiptDate: d(grn.receiptDate),
      },
    });

    for (const [i, l] of grn.lines.entries()) {
      const data = {
        purchaseOrderLineId: poLineId.get(`${grn.purchaseOrder}:${l.material}`)!,
        materialId: materialId.get(l.material)!,
        lotId: l.lotNumber ? lotId.get(l.lotNumber) ?? null : null,
        receivedQty: dec(l.receivedQty),
        supplierLotNumber: l.supplierLotNumber ?? null,
        coaReference: l.coaReference ?? null,
        inspectionStatus: l.inspectionStatus,
        inspectionDate: d(grn.receiptDate),
        inspectorName: l.inspectorName ?? null,
      };
      await prisma.goodsReceiptLine.upsert({
        where: { goodsReceiptId_lineNumber: { goodsReceiptId: header.id, lineNumber: i + 1 } },
        update: data,
        create: { goodsReceiptId: header.id, lineNumber: i + 1, ...data },
      });
    }
  }
  done(GOODS_RECEIPTS.length);

  // -- Sales orders -------------------------------------------------------
  step("sales orders");
  let soLineCount = 0;
  for (const so of SALES_ORDERS) {
    const total = so.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const header = await prisma.salesOrder.upsert({
      where: { companyId_orderNumber: { companyId: company.id, orderNumber: so.orderNumber } },
      update: {
        customerId: customerId.get(so.customer)!, orderDate: d(so.orderDate), requiredDate: d(so.requiredDate),
        status: so.status, deliveryStatus: so.deliveryStatus, invoiceNumber: so.invoiceNumber ?? null, totalAmount: dec(total),
      },
      create: {
        companyId: company.id, orderNumber: so.orderNumber, customerId: customerId.get(so.customer)!,
        orderDate: d(so.orderDate), requiredDate: d(so.requiredDate),
        status: so.status, deliveryStatus: so.deliveryStatus, invoiceNumber: so.invoiceNumber ?? null, totalAmount: dec(total),
      },
    });

    for (const [i, l] of so.lines.entries()) {
      const data = {
        materialId: materialId.get(l.material)!, locationId: locationId.get(l.location)!,
        quantity: dec(l.quantity), shippedQty: dec(l.shippedQty),
        unitPrice: dec(l.unitPrice), lineTotal: dec(l.quantity * l.unitPrice),
        requiredDate: d(l.requiredDate),
      };
      await prisma.salesOrderLine.upsert({
        where: { salesOrderId_lineNumber: { salesOrderId: header.id, lineNumber: i + 1 } },
        update: data,
        create: { salesOrderId: header.id, lineNumber: i + 1, ...data },
      });
      soLineCount++;
    }
  }
  done(`${SALES_ORDERS.length} orders / ${soLineCount} lines`);

  // -- Forecasts ----------------------------------------------------------
  step("demand forecasts");
  let periodCount = 0;
  for (const f of FORECASTS) {
    const key = { materialId: materialId.get(f.material)!, locationId: locationId.get(f.location)! };
    // DemandForecast has no natural unique key (a material may hold several
    // forecasts), so it is matched on name within material and location.
    const existing = await prisma.demandForecast.findFirst({ where: { ...key, name: f.name } });
    const forecast = existing
      ? await prisma.demandForecast.update({ where: { id: existing.id }, data: { isActive: true } })
      : await prisma.demandForecast.create({ data: { companyId: company.id, ...key, name: f.name, isActive: true } });

    for (const p of f.periods) {
      const data = {
        periodEnd: d(p.periodEnd),
        forecastQty: dec(p.forecastQty),
        actualQty: p.actualQty !== undefined ? dec(p.actualQty) : null,
        consumedQty: dec(p.consumedQty ?? 0),
      };
      await prisma.forecastPeriod.upsert({
        where: { forecastId_periodStart: { forecastId: forecast.id, periodStart: d(p.periodStart) } },
        update: data,
        create: { forecastId: forecast.id, periodStart: d(p.periodStart), ...data },
      });
      periodCount++;
    }
  }
  done(`${FORECASTS.length} forecasts / ${periodCount} periods`);

  // -- Work orders --------------------------------------------------------
  step("work orders");
  let operationCount = 0;
  for (const wo of WORK_ORDERS) {
    const bomVersion = wo.bomCode
      ? await prisma.bomVersion.findFirst({ where: { bom: { companyId: company.id, code: wo.bomCode }, isActive: true } })
      : null;

    const header = await prisma.workOrder.upsert({
      where: { companyId_orderNumber: { companyId: company.id, orderNumber: wo.orderNumber } },
      update: {
        materialId: materialId.get(wo.material)!, locationId: locationId.get(wo.location)!,
        bomVersionId: bomVersion?.id ?? null,
        plannedQty: dec(wo.plannedQty), producedQty: dec(wo.producedQty),
        plannedStartDate: d(wo.plannedStartDate), plannedEndDate: d(wo.plannedEndDate), status: wo.status,
      },
      create: {
        companyId: company.id, orderNumber: wo.orderNumber,
        materialId: materialId.get(wo.material)!, locationId: locationId.get(wo.location)!,
        bomVersionId: bomVersion?.id ?? null,
        plannedQty: dec(wo.plannedQty), producedQty: dec(wo.producedQty),
        plannedStartDate: d(wo.plannedStartDate), plannedEndDate: d(wo.plannedEndDate), status: wo.status,
      },
    });

    for (const op of wo.operations) {
      await prisma.workOrderOperation.upsert({
        where: { workOrderId_sequence: { workOrderId: header.id, sequence: op.sequence } },
        update: { name: op.name, workCentre: op.workCentre, setupMinutes: dec(op.setupMinutes), runMinutes: dec(op.runMinutes) },
        create: { workOrderId: header.id, sequence: op.sequence, name: op.name, workCentre: op.workCentre, setupMinutes: dec(op.setupMinutes), runMinutes: dec(op.runMinutes) },
      });
      operationCount++;
    }

    // Component requirements, snapshotted from the BOM the order pins.
    if (bomVersion) {
      const components = await prisma.bomComponent.findMany({ where: { bomVersionId: bomVersion.id } });
      const base = Number(bomVersion.baseQuantity);
      for (const c of components) {
        const required = (Number(c.quantity) / base) * wo.plannedQty * (1 + Number(c.scrapFactor));
        await prisma.workOrderComponent.upsert({
          where: { workOrderId_materialId: { workOrderId: header.id, materialId: c.materialId } },
          update: { requiredQty: dec(required), requiredDate: d(wo.plannedStartDate) },
          create: { workOrderId: header.id, materialId: c.materialId, requiredQty: dec(required), requiredDate: d(wo.plannedStartDate) },
        });
      }
    }
  }
  done(`${WORK_ORDERS.length} orders / ${operationCount} operations`);

  // -- Constraints --------------------------------------------------------
  step("production constraints");
  for (const c of CONSTRAINTS) {
    const existing = await prisma.productionConstraint.findFirst({
      where: { companyId: company.id, locationId: locationId.get(c.location)!, name: c.name },
    });
    const data = {
      type: c.type, unit: c.unit, capacity: dec(c.capacity), utilised: dec(c.utilised),
      effectiveFrom: d(c.effectiveFrom), isActive: true,
    };
    if (existing) await prisma.productionConstraint.update({ where: { id: existing.id }, data });
    else await prisma.productionConstraint.create({ data: { companyId: company.id, locationId: locationId.get(c.location)!, name: c.name, ...data } });
  }
  done(CONSTRAINTS.length);

  // -- Integrations -------------------------------------------------------
  step("integrations");
  for (const i of INTEGRATIONS) {
    await prisma.integration.upsert({
      where: { companyId_code: { companyId: company.id, code: i.code } },
      update: { name: i.name, category: i.category, status: i.status, isActive: i.isActive, lastSyncStatus: "lastSyncStatus" in i ? i.lastSyncStatus : null, lastErrorText: "lastErrorText" in i ? i.lastErrorText : null },
      create: { companyId: company.id, code: i.code, name: i.name, category: i.category, status: i.status, isActive: i.isActive, lastSyncStatus: "lastSyncStatus" in i ? i.lastSyncStatus : null, lastErrorText: "lastErrorText" in i ? i.lastErrorText : null },
    });
  }
  done(INTEGRATIONS.length);

  console.log(`\nSeed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Sign in with any of: ${USERS.map((u) => u.email).join(", ")}`);
  console.log(`Password: ${password}\n`);
}

main()
  .catch((e) => {
    console.error("\nSeed failed:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
