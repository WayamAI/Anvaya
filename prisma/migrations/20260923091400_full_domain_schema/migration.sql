-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('RAW', 'PACKAGING', 'SEMI_FINISHED', 'FINISHED', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ProcurementType" AS ENUM ('BUY', 'MAKE');

-- CreateEnum
CREATE TYPE "LotSizingRule" AS ENUM ('LOT_FOR_LOT', 'FIXED_ORDER_QTY', 'MIN_ORDER_QTY', 'PERIOD_ORDER_QTY');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PLANT', 'WAREHOUSE', 'DEPOT', 'HUB');

-- CreateEnum
CREATE TYPE "QcStatus" AS ENUM ('PENDING', 'APPROVED', 'QUARANTINE', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'PRODUCTION_RECEIPT', 'PRODUCTION_ISSUE', 'SCRAP', 'RETURN');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DISTRIBUTOR', 'MODERN_TRADE', 'ECOMMERCE', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANNED', 'FIRMED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('CAPACITY', 'LABOUR', 'EQUIPMENT', 'MATERIAL', 'REGULATORY');

-- CreateEnum
CREATE TYPE "MrpRunStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlannedOrderType" AS ENUM ('PURCHASE', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PlannedOrderStatus" AS ENUM ('PLANNED', 'FIRMED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DemandSourceType" AS ENUM ('SALES_ORDER', 'FORECAST', 'DEPENDENT', 'SAFETY_STOCK', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "MrpExceptionType" AS ENUM ('MATERIAL_SHORTAGE', 'LATE_SUPPLY', 'PAST_DUE_RELEASE', 'MISSING_BOM', 'MISSING_VENDOR', 'MISSING_LEAD_TIME', 'EXCESS_STOCK', 'BOM_CYCLE');

-- CreateEnum
CREATE TYPE "ExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ForecastMethod" AS ENUM ('MANUAL', 'MOVING_AVERAGE', 'EXPONENTIAL_SMOOTHING', 'SEASONAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'APPROVE', 'RECEIVE', 'ADJUST', 'MRP_RUN');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'PENDING');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'IN',
    "isManufacturing" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "MaterialKind" NOT NULL,
    "categoryId" TEXT,
    "unitOfMeasureId" TEXT NOT NULL,
    "standardCost" DECIMAL(18,4),
    "shelfLifeDays" INTEGER,
    "isBatchTracked" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_location_policies" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "procurementType" "ProcurementType" NOT NULL DEFAULT 'BUY',
    "safetyStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lotSizingRule" "LotSizingRule" NOT NULL DEFAULT 'LOT_FOR_LOT',
    "minOrderQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "maxOrderQty" DECIMAL(18,6),
    "orderMultiple" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "periodDays" INTEGER,
    "productionLeadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "safetyLeadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "averageDailyDemand" DECIMAL(18,6),
    "demandStdDev" DECIMAL(18,6),
    "serviceLevel" DECIMAL(5,4),
    "abcClass" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_location_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorCode" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'IN',
    "paymentTerms" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_materials" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,4),
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "minOrderQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "orderMultiple" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_scorecards" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "defectRatePercent" DECIMAL(9,4),
    "onTimeDeliveryPercent" DECIMAL(9,4),
    "copqAmount" DECIMAL(18,4),
    "lastAuditDate" DATE,
    "auditResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'DISTRIBUTOR',
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'IN',
    "paymentTerms" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_versions" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "baseQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "scrapFactor" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "leadTimeOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "onHandQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quarantineQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "valuation" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lastMovementAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "supplierLotNumber" TEXT,
    "vendorId" TEXT,
    "receivedQty" DECIMAL(18,6) NOT NULL,
    "consumedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remainingQty" DECIMAL(18,6) NOT NULL,
    "receiptDate" DATE NOT NULL,
    "expiryDate" DATE,
    "qcStatus" "QcStatus" NOT NULL DEFAULT 'PENDING',
    "coaReference" TEXT,
    "releaseDate" DATE,
    "releasedBy" TEXT,
    "storageLocation" TEXT,
    "bin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "balanceAfter" DECIMAL(18,6) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantityBefore" DECIMAL(18,6) NOT NULL,
    "quantityAfter" DECIMAL(18,6) NOT NULL,
    "quantityDelta" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "requiredDate" DATE NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT,
    "dispatchDate" DATE,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "shippedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "requiredDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecasts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "method" "ForecastMethod" NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_periods" (
    "id" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "forecastQty" DECIMAL(18,6) NOT NULL,
    "actualQty" DECIMAL(18,6),
    "consumedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDeliveryDate" DATE NOT NULL,
    "actualDeliveryDate" DATE,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,6) NOT NULL,
    "receivedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedDeliveryDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "receiptDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "receivedQty" DECIMAL(18,6) NOT NULL,
    "rejectedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "supplierLotNumber" TEXT,
    "coaReference" TEXT,
    "inspectionStatus" "QcStatus" NOT NULL DEFAULT 'PENDING',
    "inspectionDate" DATE,
    "inspectorName" TEXT,
    "storageLocation" TEXT,
    "bin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "bomVersionId" TEXT,
    "locationId" TEXT NOT NULL,
    "plannedQty" DECIMAL(18,6) NOT NULL,
    "producedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scrappedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE NOT NULL,
    "actualStartDate" DATE,
    "actualEndDate" DATE,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_operations" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workCentre" TEXT,
    "setupMinutes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "runMinutes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_components" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requiredQty" DECIMAL(18,6) NOT NULL,
    "issuedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lotId" TEXT,
    "requiredDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_constraints" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConstraintType" NOT NULL,
    "unit" TEXT,
    "capacity" DECIMAL(18,6),
    "utilised" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runNumber" TEXT NOT NULL,
    "status" "MrpRunStatus" NOT NULL DEFAULT 'DRAFT',
    "asOfDate" DATE NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "bucketSizeDays" INTEGER NOT NULL DEFAULT 1,
    "inputHash" TEXT,
    "triggeredById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "materialsPlanned" INTEGER NOT NULL DEFAULT 0,
    "plannedOrderCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mrp_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_run_parameters" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_run_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_requirements" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lowLevelCode" INTEGER NOT NULL,
    "bucketStart" DATE NOT NULL,
    "bucketEnd" DATE NOT NULL,
    "grossRequirement" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scheduledReceipts" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "projectedOnHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "safetyStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "netRequirement" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "plannedReceipt" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "plannedRelease" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_orders" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "PlannedOrderType" NOT NULL,
    "status" "PlannedOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "quantity" DECIMAL(18,6) NOT NULL,
    "releaseDate" DATE NOT NULL,
    "requiredDate" DATE NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "leadTimeSource" TEXT,
    "suggestedVendorId" TEXT,
    "lowLevelCode" INTEGER NOT NULL DEFAULT 0,
    "convertedToPurchaseOrderId" TEXT,
    "convertedToWorkOrderId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_peggings" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "plannedOrderId" TEXT NOT NULL,
    "demandSourceType" "DemandSourceType" NOT NULL,
    "demandSourceId" TEXT,
    "demandReference" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "requiredDate" DATE NOT NULL,
    "parentPlannedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_peggings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_explanations" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "plannedOrderId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_exceptions" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "materialId" TEXT,
    "locationId" TEXT,
    "type" "MrpExceptionType" NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "message" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "quantity" DECIMAL(18,6),
    "dueDate" DATE,
    "daysLate" INTEGER,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mrp_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "previousValues" JSONB,
    "newValues" JSONB,
    "requestId" TEXT,
    "mrpRunId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastErrorText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_companyId_idx" ON "locations"("companyId");

-- CreateIndex
CREATE INDEX "locations_companyId_isActive_idx" ON "locations"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "locations_companyId_code_key" ON "locations"("companyId", "code");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_companyId_email_key" ON "users"("companyId", "email");

-- CreateIndex
CREATE INDEX "roles_companyId_idx" ON "roles"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_companyId_code_key" ON "roles"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "material_categories_companyId_idx" ON "material_categories"("companyId");

-- CreateIndex
CREATE INDEX "material_categories_parentId_idx" ON "material_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_companyId_code_key" ON "material_categories"("companyId", "code");

-- CreateIndex
CREATE INDEX "units_of_measure_companyId_idx" ON "units_of_measure"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_companyId_code_key" ON "units_of_measure"("companyId", "code");

-- CreateIndex
CREATE INDEX "materials_companyId_idx" ON "materials"("companyId");

-- CreateIndex
CREATE INDEX "materials_companyId_kind_idx" ON "materials"("companyId", "kind");

-- CreateIndex
CREATE INDEX "materials_companyId_isActive_idx" ON "materials"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "materials_categoryId_idx" ON "materials"("categoryId");

-- CreateIndex
CREATE INDEX "materials_unitOfMeasureId_idx" ON "materials"("unitOfMeasureId");

-- CreateIndex
CREATE UNIQUE INDEX "materials_companyId_code_key" ON "materials"("companyId", "code");

-- CreateIndex
CREATE INDEX "material_location_policies_materialId_idx" ON "material_location_policies"("materialId");

-- CreateIndex
CREATE INDEX "material_location_policies_locationId_idx" ON "material_location_policies"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "material_location_policies_materialId_locationId_key" ON "material_location_policies"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "vendors_companyId_idx" ON "vendors"("companyId");

-- CreateIndex
CREATE INDEX "vendors_companyId_isActive_idx" ON "vendors"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_companyId_code_key" ON "vendors"("companyId", "code");

-- CreateIndex
CREATE INDEX "vendor_materials_vendorId_idx" ON "vendor_materials"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_materials_materialId_idx" ON "vendor_materials"("materialId");

-- CreateIndex
CREATE INDEX "vendor_materials_materialId_isPreferred_idx" ON "vendor_materials"("materialId", "isPreferred");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_materials_vendorId_materialId_key" ON "vendor_materials"("vendorId", "materialId");

-- CreateIndex
CREATE INDEX "vendor_scorecards_vendorId_idx" ON "vendor_scorecards"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_scorecards_vendorId_periodStart_periodEnd_key" ON "vendor_scorecards"("vendorId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_code_key" ON "customers"("companyId", "code");

-- CreateIndex
CREATE INDEX "boms_companyId_idx" ON "boms"("companyId");

-- CreateIndex
CREATE INDEX "boms_materialId_idx" ON "boms"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "boms_companyId_code_key" ON "boms"("companyId", "code");

-- CreateIndex
CREATE INDEX "bom_versions_bomId_idx" ON "bom_versions"("bomId");

-- CreateIndex
CREATE INDEX "bom_versions_bomId_isActive_idx" ON "bom_versions"("bomId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "bom_versions_bomId_version_key" ON "bom_versions"("bomId", "version");

-- CreateIndex
CREATE INDEX "bom_components_bomVersionId_idx" ON "bom_components"("bomVersionId");

-- CreateIndex
CREATE INDEX "bom_components_materialId_idx" ON "bom_components"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_components_bomVersionId_materialId_position_key" ON "bom_components"("bomVersionId", "materialId", "position");

-- CreateIndex
CREATE INDEX "inventory_balances_materialId_idx" ON "inventory_balances"("materialId");

-- CreateIndex
CREATE INDEX "inventory_balances_locationId_idx" ON "inventory_balances"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_materialId_locationId_key" ON "inventory_balances"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "inventory_lots_materialId_idx" ON "inventory_lots"("materialId");

-- CreateIndex
CREATE INDEX "inventory_lots_locationId_idx" ON "inventory_lots"("locationId");

-- CreateIndex
CREATE INDEX "inventory_lots_vendorId_idx" ON "inventory_lots"("vendorId");

-- CreateIndex
CREATE INDEX "inventory_lots_qcStatus_idx" ON "inventory_lots"("qcStatus");

-- CreateIndex
CREATE INDEX "inventory_lots_expiryDate_idx" ON "inventory_lots"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_materialId_lotNumber_key" ON "inventory_lots"("materialId", "lotNumber");

-- CreateIndex
CREATE INDEX "stock_movements_materialId_locationId_occurredAt_idx" ON "stock_movements"("materialId", "locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_lotId_idx" ON "stock_movements"("lotId");

-- CreateIndex
CREATE INDEX "stock_movements_referenceType_referenceId_idx" ON "stock_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "stock_movements_occurredAt_idx" ON "stock_movements"("occurredAt");

-- CreateIndex
CREATE INDEX "inventory_adjustments_materialId_locationId_idx" ON "inventory_adjustments"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "inventory_adjustments_createdById_idx" ON "inventory_adjustments"("createdById");

-- CreateIndex
CREATE INDEX "inventory_adjustments_createdAt_idx" ON "inventory_adjustments"("createdAt");

-- CreateIndex
CREATE INDEX "sales_orders_companyId_idx" ON "sales_orders"("companyId");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");

-- CreateIndex
CREATE INDEX "sales_orders_companyId_status_idx" ON "sales_orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "sales_orders_requiredDate_idx" ON "sales_orders"("requiredDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_companyId_orderNumber_key" ON "sales_orders"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "sales_order_lines_salesOrderId_idx" ON "sales_order_lines"("salesOrderId");

-- CreateIndex
CREATE INDEX "sales_order_lines_materialId_idx" ON "sales_order_lines"("materialId");

-- CreateIndex
CREATE INDEX "sales_order_lines_locationId_idx" ON "sales_order_lines"("locationId");

-- CreateIndex
CREATE INDEX "sales_order_lines_requiredDate_idx" ON "sales_order_lines"("requiredDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_lines_salesOrderId_lineNumber_key" ON "sales_order_lines"("salesOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "demand_forecasts_companyId_idx" ON "demand_forecasts"("companyId");

-- CreateIndex
CREATE INDEX "demand_forecasts_materialId_locationId_idx" ON "demand_forecasts"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "demand_forecasts_customerId_idx" ON "demand_forecasts"("customerId");

-- CreateIndex
CREATE INDEX "forecast_periods_forecastId_idx" ON "forecast_periods"("forecastId");

-- CreateIndex
CREATE INDEX "forecast_periods_periodStart_periodEnd_idx" ON "forecast_periods"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_periods_forecastId_periodStart_key" ON "forecast_periods"("forecastId", "periodStart");

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

-- CreateIndex
CREATE INDEX "purchase_orders_vendorId_idx" ON "purchase_orders"("vendorId");

-- CreateIndex
CREATE INDEX "purchase_orders_locationId_idx" ON "purchase_orders"("locationId");

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_status_idx" ON "purchase_orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_expectedDeliveryDate_status_idx" ON "purchase_orders"("expectedDeliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_companyId_orderNumber_key" ON "purchase_orders"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_materialId_idx" ON "purchase_order_lines"("materialId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_expectedDeliveryDate_idx" ON "purchase_order_lines"("expectedDeliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_lineNumber_key" ON "purchase_order_lines"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "goods_receipts_companyId_idx" ON "goods_receipts"("companyId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipts_vendorId_idx" ON "goods_receipts"("vendorId");

-- CreateIndex
CREATE INDEX "goods_receipts_receiptDate_idx" ON "goods_receipts"("receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_companyId_grnNumber_key" ON "goods_receipts"("companyId", "grnNumber");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_materialId_idx" ON "goods_receipt_lines"("materialId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_lotId_idx" ON "goods_receipt_lines"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_goodsReceiptId_lineNumber_key" ON "goods_receipt_lines"("goodsReceiptId", "lineNumber");

-- CreateIndex
CREATE INDEX "work_orders_companyId_idx" ON "work_orders"("companyId");

-- CreateIndex
CREATE INDEX "work_orders_materialId_idx" ON "work_orders"("materialId");

-- CreateIndex
CREATE INDEX "work_orders_locationId_idx" ON "work_orders"("locationId");

-- CreateIndex
CREATE INDEX "work_orders_companyId_status_idx" ON "work_orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "work_orders_plannedEndDate_status_idx" ON "work_orders"("plannedEndDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_companyId_orderNumber_key" ON "work_orders"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "work_order_operations_workOrderId_idx" ON "work_order_operations"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_operations_workOrderId_sequence_key" ON "work_order_operations"("workOrderId", "sequence");

-- CreateIndex
CREATE INDEX "work_order_components_workOrderId_idx" ON "work_order_components"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_components_materialId_idx" ON "work_order_components"("materialId");

-- CreateIndex
CREATE INDEX "work_order_components_lotId_idx" ON "work_order_components"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_components_workOrderId_materialId_key" ON "work_order_components"("workOrderId", "materialId");

-- CreateIndex
CREATE INDEX "production_constraints_companyId_idx" ON "production_constraints"("companyId");

-- CreateIndex
CREATE INDEX "production_constraints_locationId_idx" ON "production_constraints"("locationId");

-- CreateIndex
CREATE INDEX "production_constraints_companyId_isActive_idx" ON "production_constraints"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "mrp_runs_companyId_idx" ON "mrp_runs"("companyId");

-- CreateIndex
CREATE INDEX "mrp_runs_companyId_status_idx" ON "mrp_runs"("companyId", "status");

-- CreateIndex
CREATE INDEX "mrp_runs_asOfDate_idx" ON "mrp_runs"("asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "mrp_runs_companyId_runNumber_key" ON "mrp_runs"("companyId", "runNumber");

-- CreateIndex
CREATE INDEX "mrp_run_parameters_mrpRunId_idx" ON "mrp_run_parameters"("mrpRunId");

-- CreateIndex
CREATE UNIQUE INDEX "mrp_run_parameters_mrpRunId_key_key" ON "mrp_run_parameters"("mrpRunId", "key");

-- CreateIndex
CREATE INDEX "mrp_requirements_mrpRunId_idx" ON "mrp_requirements"("mrpRunId");

-- CreateIndex
CREATE INDEX "mrp_requirements_mrpRunId_materialId_idx" ON "mrp_requirements"("mrpRunId", "materialId");

-- CreateIndex
CREATE INDEX "mrp_requirements_materialId_locationId_idx" ON "mrp_requirements"("materialId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "mrp_requirements_mrpRunId_materialId_locationId_bucketStart_key" ON "mrp_requirements"("mrpRunId", "materialId", "locationId", "bucketStart");

-- CreateIndex
CREATE INDEX "planned_orders_mrpRunId_idx" ON "planned_orders"("mrpRunId");

-- CreateIndex
CREATE INDEX "planned_orders_mrpRunId_type_idx" ON "planned_orders"("mrpRunId", "type");

-- CreateIndex
CREATE INDEX "planned_orders_materialId_locationId_idx" ON "planned_orders"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "planned_orders_releaseDate_idx" ON "planned_orders"("releaseDate");

-- CreateIndex
CREATE INDEX "planned_orders_mrpRunId_status_idx" ON "planned_orders"("mrpRunId", "status");

-- CreateIndex
CREATE INDEX "mrp_peggings_mrpRunId_idx" ON "mrp_peggings"("mrpRunId");

-- CreateIndex
CREATE INDEX "mrp_peggings_plannedOrderId_idx" ON "mrp_peggings"("plannedOrderId");

-- CreateIndex
CREATE INDEX "mrp_peggings_demandSourceType_demandSourceId_idx" ON "mrp_peggings"("demandSourceType", "demandSourceId");

-- CreateIndex
CREATE INDEX "mrp_peggings_parentPlannedOrderId_idx" ON "mrp_peggings"("parentPlannedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "mrp_explanations_plannedOrderId_key" ON "mrp_explanations"("plannedOrderId");

-- CreateIndex
CREATE INDEX "mrp_explanations_mrpRunId_idx" ON "mrp_explanations"("mrpRunId");

-- CreateIndex
CREATE INDEX "mrp_exceptions_mrpRunId_idx" ON "mrp_exceptions"("mrpRunId");

-- CreateIndex
CREATE INDEX "mrp_exceptions_mrpRunId_type_idx" ON "mrp_exceptions"("mrpRunId", "type");

-- CreateIndex
CREATE INDEX "mrp_exceptions_mrpRunId_severity_idx" ON "mrp_exceptions"("mrpRunId", "severity");

-- CreateIndex
CREATE INDEX "mrp_exceptions_materialId_locationId_idx" ON "mrp_exceptions"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_mrpRunId_idx" ON "audit_logs"("mrpRunId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "integrations_companyId_idx" ON "integrations"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_companyId_code_key" ON "integrations"("companyId", "code");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_location_policies" ADD CONSTRAINT "material_location_policies_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_location_policies" ADD CONSTRAINT "material_location_policies_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_materials" ADD CONSTRAINT "vendor_materials_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_materials" ADD CONSTRAINT "vendor_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_scorecards" ADD CONSTRAINT "vendor_scorecards_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_versions" ADD CONSTRAINT "bom_versions_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "bom_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_periods" ADD CONSTRAINT "forecast_periods_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "demand_forecasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "bom_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_operations" ADD CONSTRAINT "work_order_operations_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_components" ADD CONSTRAINT "work_order_components_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_components" ADD CONSTRAINT "work_order_components_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_components" ADD CONSTRAINT "work_order_components_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_constraints" ADD CONSTRAINT "production_constraints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_constraints" ADD CONSTRAINT "production_constraints_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_runs" ADD CONSTRAINT "mrp_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_runs" ADD CONSTRAINT "mrp_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_run_parameters" ADD CONSTRAINT "mrp_run_parameters_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_requirements" ADD CONSTRAINT "mrp_requirements_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_requirements" ADD CONSTRAINT "mrp_requirements_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_requirements" ADD CONSTRAINT "mrp_requirements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_orders" ADD CONSTRAINT "planned_orders_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_orders" ADD CONSTRAINT "planned_orders_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_orders" ADD CONSTRAINT "planned_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_peggings" ADD CONSTRAINT "mrp_peggings_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_peggings" ADD CONSTRAINT "mrp_peggings_plannedOrderId_fkey" FOREIGN KEY ("plannedOrderId") REFERENCES "planned_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_explanations" ADD CONSTRAINT "mrp_explanations_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_explanations" ADD CONSTRAINT "mrp_explanations_plannedOrderId_fkey" FOREIGN KEY ("plannedOrderId") REFERENCES "planned_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_exceptions" ADD CONSTRAINT "mrp_exceptions_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "mrp_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_exceptions" ADD CONSTRAINT "mrp_exceptions_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_exceptions" ADD CONSTRAINT "mrp_exceptions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
