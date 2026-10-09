"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { btnPrimary, btnSecondarySm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { RecordFormDialog, type FieldSpec, type FormValues } from "@/components/app/record-form";
import { nullNum, nullText, optNum, optText } from "@/components/app/record-form-values";
import { apiGet, apiSend } from "@/lib/api";

/**
 * Create and edit buttons for the master data every workflow depends on:
 * materials and their planning policies, vendors and what they supply,
 * customers and locations.
 *
 * A button renders only for a user holding the permission; the API checks it
 * again, along with every field, on each request.
 */

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opts = (values: readonly string[], label: (v: string) => string = (v) => v.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())) =>
  values.map((v) => ({ value: v, label: label(v) }));

const CODE_HELP = "Permanent: letters, digits, '.', '_' or '-'";
const codeField: FieldSpec = { key: "code", label: "Code", required: true, lockedOnEdit: true, maxLength: 40, help: CODE_HELP };

function useInvalidate(...keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
}

function FormButton({ permission, label, small, children }: {
  permission: string; label: string; small?: boolean; children: (close: () => void) => React.ReactNode;
}) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can(permission)) return null;
  return (
    <>
      <button type="button" className={small ? btnSecondarySm : btnPrimary} onClick={() => setOpen(true)}>{label}</button>
      {open && children(() => setOpen(false))}
    </>
  );
}

/* ---- Materials --------------------------------------------------------- */

const KINDS = ["RAW", "PACKAGING", "SEMI_FINISHED", "FINISHED", "CONSUMABLE"] as const;

export interface MaterialFormRecord {
  id: string; code: string; name: string; description: string | null; kind: string;
  category: { id: string } | null; unit: { id: string }; standardCost: number | null;
  shelfLifeDays: number | null; isBatchTracked: boolean; isActive: boolean;
}

export function MaterialFormButton({ material, onSaved }: { material?: MaterialFormRecord; onSaved?: (id: string) => void }) {
  const isEdit = !!material;
  const invalidate = useInvalidate(["materials"], ["material"], ["picker"]);
  const units = useQuery({ queryKey: ["units"], queryFn: () => apiGet<{ id: string; code: string; name: string }[]>("/units") });
  const categories = useQuery({ queryKey: ["material-categories"], queryFn: () => apiGet<{ id: string; code: string; name: string }[]>("/material-categories") });

  const fields: FieldSpec[] = [
    codeField,
    { key: "name", label: "Name", required: true, span: 2, maxLength: 200 },
    { key: "kind", label: "Kind", type: "select", required: true, options: opts(KINDS) },
    { key: "unitOfMeasureId", label: "Unit", type: "select", required: true, options: (units.data ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` })) },
    { key: "categoryId", label: "Category", type: "select", options: (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
    { key: "standardCost", label: "Standard cost (₹)", type: "number", min: 0 },
    { key: "shelfLifeDays", label: "Shelf life (days)", type: "number", min: 0, max: 3650, integer: true },
    { key: "isBatchTracked", label: "Batch tracked", type: "checkbox", help: "Receipts and output create lots" },
    { key: "description", label: "Description", type: "textarea", span: 3, maxLength: 2000 },
    ...(isEdit ? [{ key: "isActive", label: "Active", type: "checkbox" as const, help: "Inactive materials are left out of planning" }] : []),
  ];
  const initial: FormValues = {
    code: str(material?.code), name: str(material?.name), kind: str(material?.kind), unitOfMeasureId: str(material?.unit.id),
    categoryId: str(material?.category?.id), standardCost: str(material?.standardCost), shelfLifeDays: str(material?.shelfLifeDays),
    isBatchTracked: material?.isBatchTracked ?? false, description: str(material?.description), isActive: material?.isActive ?? true,
  };

  return (
    <FormButton permission={isEdit ? "material:update" : "material:create"} label={isEdit ? "Edit" : "New material"} small={isEdit}>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `Edit ${material.code}` : "New material"}
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => (isEdit ? `${material.code} updated` : "Material created")}
          toBody={(v, changed) => {
            if (!isEdit) {
              return {
                code: optText(v.code), name: optText(v.name), kind: v.kind, unitOfMeasureId: v.unitOfMeasureId,
                categoryId: optText(v.categoryId), standardCost: optNum(v.standardCost), shelfLifeDays: optNum(v.shelfLifeDays),
                isBatchTracked: v.isBatchTracked, description: optText(v.description),
              };
            }
            const b: Record<string, unknown> = {};
            if (changed("name")) b.name = optText(v.name);
            if (changed("kind")) b.kind = v.kind;
            if (changed("unitOfMeasureId")) b.unitOfMeasureId = v.unitOfMeasureId;
            if (changed("categoryId")) b.categoryId = nullText(v.categoryId);
            if (changed("standardCost")) b.standardCost = optNum(v.standardCost) ?? 0;
            if (changed("shelfLifeDays")) b.shelfLifeDays = nullNum(v.shelfLifeDays);
            if (changed("isBatchTracked")) b.isBatchTracked = v.isBatchTracked;
            if (changed("description")) b.description = nullText(v.description);
            if (changed("isActive")) b.isActive = v.isActive;
            return b;
          }}
          submit={(body) => (isEdit ? apiSend("PATCH", `/materials/${material.id}`, body) : apiSend<{ id: string }>("POST", "/materials", body))}
          onSaved={(r) => { invalidate(); onSaved?.((r as { id: string }).id); }}
        />
      )}
    </FormButton>
  );
}

/* ---- Planning policy (per material and location) ------------------------ */

const RULES = ["LOT_FOR_LOT", "FIXED_ORDER_QTY", "MIN_ORDER_QTY", "PERIOD_ORDER_QTY"] as const;

export interface PolicyFormRecord {
  location: { id: string; name: string }; procurementType: string; safetyStock: number | null; reorderPoint: number | null;
  lotSizingRule: string; minOrderQty: number | null; maxOrderQty: number | null; orderMultiple: number | null; periodDays: number | null;
  productionLeadTimeDays: number; safetyLeadTimeDays: number; abcClass: string | null; isActive: boolean;
}

export function PolicyFormButton({ materialId, materialCode, policy, locations }: {
  materialId: string; materialCode: string; policy?: PolicyFormRecord; locations: { id: string; name: string }[];
}) {
  const isEdit = !!policy;
  const invalidate = useInvalidate(["material", materialId], ["materials"]);
  const fields: FieldSpec[] = [
    { key: "locationId", label: "Location", type: "select", required: true, lockedOnEdit: true, options: locations.map((l) => ({ value: l.id, label: l.name })) },
    { key: "procurementType", label: "Supply by", type: "select", required: true, options: [{ value: "BUY", label: "Buy" }, { value: "MAKE", label: "Make" }] },
    { key: "abcClass", label: "ABC class", type: "select", options: opts(["A", "B", "C"], (v) => v) },
    { key: "safetyStock", label: "Safety stock", type: "number", min: 0 },
    { key: "reorderPoint", label: "Reorder point", type: "number", min: 0, help: "Not below safety stock" },
    { key: "productionLeadTimeDays", label: "Make lead time (days)", type: "number", min: 0, max: 3650, integer: true, help: "For a bought item the vendor's lead time applies" },
    { key: "lotSizingRule", label: "Lot sizing", type: "select", required: true, options: opts(RULES) },
    { key: "minOrderQty", label: "Min / fixed order qty", type: "number", min: 0 },
    { key: "maxOrderQty", label: "Max order qty", type: "number", min: 0 },
    { key: "orderMultiple", label: "Order multiple", type: "number", min: 0 },
    { key: "periodDays", label: "Period (days)", type: "number", min: 1, max: 365, integer: true, when: (v) => v.lotSizingRule === "PERIOD_ORDER_QTY", required: true },
    { key: "safetyLeadTimeDays", label: "Safety lead time (days)", type: "number", min: 0, max: 3650, integer: true },
    { key: "isActive", label: "Plan this material here", type: "checkbox" },
  ];
  const initial: FormValues = {
    locationId: str(policy?.location.id), procurementType: str(policy?.procurementType ?? "BUY"), abcClass: str(policy?.abcClass),
    safetyStock: str(policy?.safetyStock ?? 0), reorderPoint: str(policy?.reorderPoint ?? 0), productionLeadTimeDays: str(policy?.productionLeadTimeDays ?? 0),
    lotSizingRule: str(policy?.lotSizingRule ?? "LOT_FOR_LOT"), minOrderQty: str(policy?.minOrderQty ?? 0), maxOrderQty: str(policy?.maxOrderQty),
    orderMultiple: str(policy?.orderMultiple ?? 0), periodDays: str(policy?.periodDays), safetyLeadTimeDays: str(policy?.safetyLeadTimeDays ?? 0),
    isActive: policy?.isActive ?? true,
  };
  return (
    <FormButton permission="material:update" label={isEdit ? "Edit" : "Add location policy"} small>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `${materialCode} at ${policy.location.name}` : `New planning policy — ${materialCode}`}
          description="How MRP plans this material at one location."
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => "Planning policy saved"}
          // The policy endpoint is a full upsert, so every field is sent each time.
          toBody={(v) => ({
            procurementType: v.procurementType, abcClass: nullText(v.abcClass),
            safetyStock: optNum(v.safetyStock) ?? 0, reorderPoint: optNum(v.reorderPoint) ?? 0,
            productionLeadTimeDays: optNum(v.productionLeadTimeDays) ?? 0, safetyLeadTimeDays: optNum(v.safetyLeadTimeDays) ?? 0,
            lotSizingRule: v.lotSizingRule, minOrderQty: optNum(v.minOrderQty) ?? 0, maxOrderQty: nullNum(v.maxOrderQty),
            orderMultiple: optNum(v.orderMultiple) ?? 0, periodDays: v.lotSizingRule === "PERIOD_ORDER_QTY" ? nullNum(v.periodDays) : null,
            isActive: v.isActive,
            __location: v.locationId,
          })}
          submit={({ __location, ...body }) => apiSend("PUT", `/materials/${materialId}/policies/${__location as string}`, body)}
          onSaved={invalidate}
        />
      )}
    </FormButton>
  );
}

/* ---- Vendors ------------------------------------------------------------ */

export interface VendorFormRecord {
  id: string; code: string; vendorCode: string | null; name: string; contactPerson: string | null; contactEmail: string | null;
  contactPhone: string | null; addressLine1: string | null; city: string | null; state: string | null; country: string | null;
  paymentTerms: string | null; isApproved: boolean; isActive: boolean;
}

const VENDOR_TEXT = ["vendorCode", "contactPerson", "contactEmail", "contactPhone", "addressLine1", "city", "state", "country", "paymentTerms"] as const;

export function VendorFormButton({ vendor, onSaved }: { vendor?: VendorFormRecord; onSaved?: (id: string) => void }) {
  const isEdit = !!vendor;
  const invalidate = useInvalidate(["vendors"], ["vendor"], ["picker"]);
  const fields: FieldSpec[] = [
    codeField,
    { key: "name", label: "Name", required: true, span: 2, maxLength: 200 },
    { key: "contactPerson", label: "Contact person", maxLength: 100 },
    { key: "contactEmail", label: "Contact email", type: "email", maxLength: 254 },
    { key: "contactPhone", label: "Phone", maxLength: 40 },
    { key: "addressLine1", label: "Address", span: 3, maxLength: 200 },
    { key: "city", label: "City", maxLength: 100 },
    { key: "state", label: "State", maxLength: 100 },
    { key: "country", label: "Country", maxLength: 2, placeholder: "IN", help: "Two-letter code" },
    { key: "paymentTerms", label: "Payment terms", maxLength: 100, placeholder: "Net 30" },
    { key: "vendorCode", label: "Their code for us", maxLength: 40 },
    { key: "isApproved", label: "Approved supplier (ASL)", type: "checkbox", help: "Required before a PO can be approved" },
    ...(isEdit ? [{ key: "isActive", label: "Active", type: "checkbox" as const }] : []),
  ];
  const initial: FormValues = {
    code: str(vendor?.code), name: str(vendor?.name), isApproved: vendor?.isApproved ?? false, isActive: vendor?.isActive ?? true,
    ...Object.fromEntries(VENDOR_TEXT.map((k) => [k, str(vendor?.[k])])),
  };
  return (
    <FormButton permission={isEdit ? "vendor:update" : "vendor:create"} label={isEdit ? "Edit vendor" : "New vendor"} small={isEdit}>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `Edit ${vendor.name}` : "New vendor"}
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => (isEdit ? `${vendor.name} updated` : "Vendor created")}
          toBody={(v, changed) => {
            if (!isEdit) {
              return {
                code: optText(v.code), name: optText(v.name), isApproved: v.isApproved,
                ...Object.fromEntries(VENDOR_TEXT.map((k) => [k, optText(v[k])])),
                country: optText(v.country)?.toUpperCase(),
              };
            }
            const b: Record<string, unknown> = {};
            if (changed("name")) b.name = optText(v.name);
            for (const k of VENDOR_TEXT) if (changed(k)) b[k] = k === "country" ? nullText(v[k])?.toUpperCase() ?? null : nullText(v[k]);
            if (changed("isApproved")) b.isApproved = v.isApproved;
            if (changed("isActive")) b.isActive = v.isActive;
            return b;
          }}
          submit={(body) => (isEdit ? apiSend("PATCH", `/vendors/${vendor.id}`, body) : apiSend<{ id: string }>("POST", "/vendors", body))}
          onSaved={(r) => { invalidate(); onSaved?.((r as { id: string }).id); }}
        />
      )}
    </FormButton>
  );
}

export interface VendorMaterialRecord {
  materialId: string; code: string; name: string; leadTimeDays: number; unitPrice: number | null;
  minOrderQty: number | null; orderMultiple: number | null; isPreferred: boolean;
}

export function VendorMaterialFormButton({ vendorId, item }: { vendorId: string; item?: VendorMaterialRecord }) {
  const isEdit = !!item;
  const invalidate = useInvalidate(["vendor", vendorId], ["picker"]);
  const fields: FieldSpec[] = [
    isEdit
      ? { key: "materialLabel", label: "Material", lockedOnEdit: true, span: 3 }
      : { key: "materialId", label: "Material", type: "picker", required: true, span: 3,
          picker: { endpoint: "/materials", params: { kinds: "RAW,PACKAGING,SEMI_FINISHED,CONSUMABLE" }, format: (m) => `${m.code} — ${m.name}` } },
    { key: "unitPrice", label: "Unit price (₹)", type: "number", min: 0, help: "Used when a PO line leaves the price blank" },
    { key: "leadTimeDays", label: "Lead time (days)", type: "number", required: true, min: 0, max: 3650, integer: true },
    { key: "minOrderQty", label: "Min order qty", type: "number", min: 0 },
    { key: "orderMultiple", label: "Order multiple", type: "number", min: 0 },
    { key: "isPreferred", label: "Preferred source", type: "checkbox", help: "MRP plans purchases from the preferred vendor" },
  ];
  const initial: FormValues = {
    materialId: str(item?.materialId), materialLabel: item ? `${item.code} — ${item.name}` : "",
    unitPrice: str(item?.unitPrice), leadTimeDays: str(item?.leadTimeDays), minOrderQty: str(item?.minOrderQty ?? 0),
    orderMultiple: str(item?.orderMultiple ?? 0), isPreferred: item?.isPreferred ?? false,
  };
  return (
    <FormButton permission="vendor:update" label={isEdit ? "Edit" : "Add material"} small>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `${item.code} from this vendor` : "Add supplied material"}
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => "Supply terms saved"}
          toBody={(v) => ({
            leadTimeDays: optNum(v.leadTimeDays), unitPrice: nullNum(v.unitPrice), minOrderQty: optNum(v.minOrderQty) ?? 0,
            orderMultiple: optNum(v.orderMultiple) ?? 0, isPreferred: v.isPreferred, __material: v.materialId,
          })}
          submit={({ __material, ...body }) => apiSend("PUT", `/vendors/${vendorId}/materials/${__material as string}`, body)}
          onSaved={invalidate}
        />
      )}
    </FormButton>
  );
}

/* ---- Customers ---------------------------------------------------------- */

const CUSTOMER_TYPES = ["DISTRIBUTOR", "MODERN_TRADE", "ECOMMERCE", "INSTITUTIONAL"] as const;
const CUSTOMER_TEXT = ["contactPerson", "contactEmail", "contactPhone", "city", "state", "country", "paymentTerms"] as const;

export interface CustomerFormRecord {
  id: string; code: string; name: string; type: string; contactPerson: string | null; contactEmail: string | null; contactPhone: string | null;
  city: string | null; state: string | null; country: string | null; paymentTerms: string | null; isActive: boolean;
}

export function CustomerFormButton({ customer }: { customer?: CustomerFormRecord }) {
  const isEdit = !!customer;
  const invalidate = useInvalidate(["customers"], ["picker"]);
  const fields: FieldSpec[] = [
    codeField,
    { key: "name", label: "Name", required: true, span: 2, maxLength: 200 },
    { key: "type", label: "Channel", type: "select", required: true, options: opts(CUSTOMER_TYPES) },
    { key: "contactPerson", label: "Contact person", maxLength: 100 },
    { key: "contactEmail", label: "Contact email", type: "email", maxLength: 254 },
    { key: "contactPhone", label: "Phone", maxLength: 40 },
    { key: "city", label: "City", maxLength: 100 },
    { key: "state", label: "State", maxLength: 100 },
    { key: "country", label: "Country", maxLength: 2, placeholder: "IN", help: "Two-letter code" },
    { key: "paymentTerms", label: "Payment terms", maxLength: 100, placeholder: "Net 30" },
    ...(isEdit ? [{ key: "isActive", label: "Active", type: "checkbox" as const }] : []),
  ];
  const initial: FormValues = {
    code: str(customer?.code), name: str(customer?.name), type: str(customer?.type ?? "DISTRIBUTOR"), isActive: customer?.isActive ?? true,
    ...Object.fromEntries(CUSTOMER_TEXT.map((k) => [k, str(customer?.[k])])),
  };
  return (
    <FormButton permission={isEdit ? "customer:update" : "customer:create"} label={isEdit ? "Edit" : "New customer"} small={isEdit}>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `Edit ${customer.name}` : "New customer"}
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => (isEdit ? `${customer.name} updated` : "Customer created")}
          toBody={(v, changed) => {
            if (!isEdit) {
              return {
                code: optText(v.code), name: optText(v.name), type: v.type,
                ...Object.fromEntries(CUSTOMER_TEXT.map((k) => [k, optText(v[k])])),
                country: optText(v.country)?.toUpperCase(),
              };
            }
            const b: Record<string, unknown> = {};
            if (changed("name")) b.name = optText(v.name);
            if (changed("type")) b.type = v.type;
            for (const k of CUSTOMER_TEXT) if (changed(k)) b[k] = k === "country" ? nullText(v[k])?.toUpperCase() ?? null : nullText(v[k]);
            if (changed("isActive")) b.isActive = v.isActive;
            return b;
          }}
          submit={(body) => (isEdit ? apiSend("PATCH", `/customers/${customer.id}`, body) : apiSend("POST", "/customers", body))}
          onSaved={invalidate}
        />
      )}
    </FormButton>
  );
}

/* ---- Locations ---------------------------------------------------------- */

const LOCATION_TYPES = ["PLANT", "WAREHOUSE", "DEPOT", "HUB"] as const;

export interface LocationFormRecord {
  id: string; code: string; name: string; type: string; city: string | null; state: string | null; isManufacturing: boolean; isActive: boolean;
}

export function LocationFormButton({ location }: { location?: LocationFormRecord }) {
  const isEdit = !!location;
  const invalidate = useInvalidate(["locations"], ["company-locations"]);
  const fields: FieldSpec[] = [
    codeField,
    { key: "name", label: "Name", required: true, span: 2, maxLength: 100 },
    { key: "type", label: "Type", type: "select", required: true, options: opts(LOCATION_TYPES) },
    { key: "city", label: "City", maxLength: 100 },
    { key: "state", label: "State", maxLength: 100 },
    { key: "isManufacturing", label: "Manufacturing site", type: "checkbox", help: "Work orders can be planned here" },
    ...(isEdit ? [{ key: "isActive", label: "Active", type: "checkbox" as const }] : []),
  ];
  const initial: FormValues = {
    code: str(location?.code), name: str(location?.name), type: str(location?.type ?? "WAREHOUSE"),
    city: str(location?.city), state: str(location?.state), isManufacturing: location?.isManufacturing ?? false, isActive: location?.isActive ?? true,
  };
  return (
    <FormButton permission={isEdit ? "location:update" : "location:create"} label={isEdit ? "Edit" : "New location"} small={isEdit}>
      {(close) => (
        <RecordFormDialog
          title={isEdit ? `Edit ${location.name}` : "New location"}
          fields={fields} initial={initial} isEdit={isEdit} onClose={close}
          successMessage={() => (isEdit ? `${location.name} updated` : "Location created")}
          toBody={(v, changed) => {
            if (!isEdit) return { code: optText(v.code), name: optText(v.name), type: v.type, city: optText(v.city), state: optText(v.state), isManufacturing: v.isManufacturing };
            const b: Record<string, unknown> = {};
            if (changed("name")) b.name = optText(v.name);
            if (changed("type")) b.type = v.type;
            if (changed("city")) b.city = nullText(v.city);
            if (changed("state")) b.state = nullText(v.state);
            if (changed("isManufacturing")) b.isManufacturing = v.isManufacturing;
            if (changed("isActive")) b.isActive = v.isActive;
            return b;
          }}
          submit={(body) => (isEdit ? apiSend("PATCH", `/locations/${location.id}`, body) : apiSend("POST", "/locations", body))}
          onSaved={invalidate}
        />
      )}
    </FormButton>
  );
}
