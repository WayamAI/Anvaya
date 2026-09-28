import { useState, useMemo, useEffect, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { Search, ChevronDown, ChevronRight, AlertTriangle, Shield, Package, X, Ban } from "lucide-react";
import { btnSecondary, btnSecondarySm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock, SkeletonTable } from "@/components/app/skeleton-block";
import { apiGet, ApiError } from "@/lib/api";
import type {
  LotRow, LotDetail, LotIndicators, QcStatus, VendorRef, ReceiptRef, Dispatch,
} from "@/server/inventory/lots";
import type { GoodsReceiptDetail, VendorDetail } from "@/server/services/trace-lookup.service";
import type { SalesOrderDetail } from "@/server/sales/sales-orders";

// ─── Helpers ───
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const fmtQty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dash = (v: string | null | undefined) => (v ? v : "—");
const lakh = (v: number | null) => (v === null ? "—" : `₹${(v / 100000).toFixed(2)}L`);

const needsContainment = (s: QcStatus) => s === "QUARANTINE" || s === "REJECTED";

const qcBadge = (s: QcStatus): { status: "green" | "amber" | "red"; label: string } =>
  s === "APPROVED" ? { status: "green", label: "Approved" }
    : s === "QUARANTINE" ? { status: "amber", label: "Quarantine" }
      : s === "PENDING" ? { status: "amber", label: "Pending" }
        : { status: "red", label: "Rejected" };

const deliveryBadge = (s: Dispatch["deliveryStatus"]): { status: "green" | "amber" | "gray"; label: string } =>
  s === "DELIVERED" ? { status: "green", label: "Delivered" }
    : s === "IN_TRANSIT" ? { status: "amber", label: "In Transit" }
      : { status: "gray", label: "Pending" };

/** RM / PM as before; other kinds are labelled for what they are rather than forced into one of the two. */
const kindBadge = (kind: string): { status: "green" | "blue" | "gray"; label: string } =>
  kind === "RAW" ? { status: "green", label: "RM" }
    : kind === "PACKAGING" ? { status: "blue", label: "PM" }
      : kind === "SEMI_FINISHED" ? { status: "gray", label: "SFG" }
        : kind === "FINISHED" ? { status: "gray", label: "FG" }
          : { status: "gray", label: kind.slice(0, 3) };

const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ");

// ─── Queries ───
const useLotDetail = (lotId: string | null) =>
  useQuery({
    queryKey: ["inventory", "lot", lotId],
    queryFn: ({ signal }) => apiGet<LotDetail>(`/inventory/lots/${lotId}`, undefined, { signal }),
    enabled: !!lotId,
  });

const useGrn = (grnNumber: string | null) =>
  useQuery({
    queryKey: ["goods-receipt", grnNumber],
    queryFn: ({ signal }) => apiGet<GoodsReceiptDetail>(`/goods-receipts/${encodeURIComponent(grnNumber!)}`, undefined, { signal }),
    enabled: !!grnNumber,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

// ─── Shared states ───
function LoadingLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
    </div>
  );
}

function LoadError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Could not be loaded"
      description={error.message}
      action={onRetry && <button className={btnSecondary} onClick={onRetry}>Try again</button>}
    />
  );
}

// ─── Drawer Types ───
type DrawerType =
  | { kind: "grn"; grnNumber: string }
  | { kind: "so"; salesOrderId: string }
  | { kind: "vendor"; vendorId: string; grnNumber?: string }
  | { kind: "qc"; lotId: string }
  | { kind: "containment"; lotId: string }
  | { kind: "product"; lotId: string }
  | null;

// ─── GRN Search result component ───
function GRNSearchResult({ grnNumber, onClose, onSelectLot }: { grnNumber: string; onClose: () => void; onSelectLot: (id: string) => void }) {
  const q = useGrn(grnNumber);

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-body-md font-semibold">GRN Detail: <span className="text-foreground identifier">{grnNumber}</span></h3>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
    </div>
  );

  if (q.isPending) return <div>{header}<LoadingLines /></div>;
  if (q.error) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div>
        {header}
        {notFound
          ? <div className="p-4 text-body-md text-muted-foreground">GRN not found: {grnNumber}</div>
          : <LoadError error={q.error} onRetry={() => void q.refetch()} />}
      </div>
    );
  }

  const grn = q.data;
  return (
    <div>
      {header}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body-sm mb-4">
        <div><span className="text-muted-foreground">PO number</span><div className="identifier text-foreground">{grn.purchaseOrder.orderNumber}</div></div>
        <div><span className="text-muted-foreground">Vendor</span><div className="font-medium">{grn.vendor.name}</div></div>
        <div><span className="text-muted-foreground">Receipt date</span><div>{fmtDate(grn.receiptDate)}</div></div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-body-sm mb-4">
          <thead><tr className="border-b border-border">
            {["Material", "Type", "Qty", "RM batch #", "Supplier lot", "Inspection", "CoA"].map(h =>
              <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>{grn.lines.map((li) => (
            <tr key={li.lineNumber} className="border-b border-border">
              <td className="px-2 py-1.5 font-medium">{li.material.name}</td>
              <td className="px-2 py-1.5"><StatusBadge {...kindBadge(li.material.kind)} /></td>
              <td className="px-2 py-1.5 tabular-nums">{fmtQty(li.receivedQty)} {li.uom}</td>
              <td className="px-2 py-1.5 identifier text-foreground">
                {li.lot ? <button onClick={() => onSelectLot(li.lot!.id)} className="hover:underline">{li.lot.lotNumber}</button> : "—"}
              </td>
              <td className="px-2 py-1.5 identifier text-body-sm">{dash(li.supplierLotNumber)}</td>
              <td className="px-2 py-1.5"><StatusBadge {...qcBadge(li.inspectionStatus)} /></td>
              <td className="px-2 py-1.5 text-muted-foreground">{dash(li.coaReference)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div>
        <h4 className="text-body-sm font-semibold text-muted-foreground mb-2">Batches produced using these inputs</h4>
        {grn.producedLots.length > 0 ? (
          <div className="space-y-1">{grn.producedLots.map(b => (
            <div key={b.id} className="flex items-center gap-3 text-body-sm p-1.5 rounded bg-secondary/30 cursor-pointer" onClick={() => onSelectLot(b.id)}>
              <span className="identifier text-foreground">{b.lotNumber}</span>
              <span className="font-medium">{b.material}</span>
              <span className="tabular-nums">{fmtQty(b.quantity)} {b.uom}</span>
              <StatusBadge {...qcBadge(b.qcStatus)} />
            </div>
          ))}</div>
        ) : <div className="text-body-sm text-muted-foreground">No recorded production has used lots from this receipt.</div>}
      </div>
    </div>
  );
}

// ─── Side Drawer ───
function SideDrawer({ drawer, onClose, onNavigate }: { drawer: NonNullable<DrawerType>; onClose: () => void; onNavigate: (d: DrawerType) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/20" />
      <div className="relative w-[520px] max-w-full h-full bg-card border-l border-border shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-body-md font-semibold">
            {drawer.kind === "grn" && `GRN Detail`}
            {drawer.kind === "so" && `Sales Order Detail`}
            {drawer.kind === "vendor" && `Vendor Detail`}
            {drawer.kind === "qc" && `QC report`}
            {drawer.kind === "containment" && `Containment Panel`}
            {drawer.kind === "product" && `Product / Formula Detail`}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {drawer.kind === "grn" && <GRNDrawerContent grnNumber={drawer.grnNumber} onNavigate={onNavigate} />}
          {drawer.kind === "so" && <SODrawerContent salesOrderId={drawer.salesOrderId} />}
          {drawer.kind === "vendor" && <VendorDrawerContent vendorId={drawer.vendorId} grnNumber={drawer.grnNumber} />}
          {drawer.kind === "qc" && <QCDrawerContent lotId={drawer.lotId} />}
          {drawer.kind === "containment" && <ContainmentDrawerContent lotId={drawer.lotId} />}
          {drawer.kind === "product" && <ProductDrawerContent lotId={drawer.lotId} />}
        </div>
      </div>
    </div>
  );
}

function GRNDrawerContent({ grnNumber, onNavigate }: { grnNumber: string; onNavigate: (d: DrawerType) => void }) {
  const q = useGrn(grnNumber);
  if (q.isPending) return <LoadingLines rows={6} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const grn = q.data;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">GRN number</span><span className="identifier text-foreground font-semibold">{grn.grnNumber}</span></div>
        <div><span className="text-muted-foreground block">Receipt date</span><span>{fmtDate(grn.receiptDate)}</span></div>
        <div><span className="text-muted-foreground block">PO number</span><span className="identifier text-foreground">{grn.purchaseOrder.orderNumber}</span></div>
        <div><span className="text-muted-foreground block">Vendor</span>
          <button onClick={() => onNavigate({ kind: "vendor", vendorId: grn.vendor.id, grnNumber })} className="text-foreground underline underline-offset-2 hover:text-foreground">{grn.vendor.name}</button>
        </div>
        <div><span className="text-muted-foreground block">PO value</span><span className="tabular-nums">₹{grn.purchaseOrder.totalAmount.toLocaleString("en-IN")}</span></div>
        <div><span className="text-muted-foreground block">PO status</span><StatusBadge status="green" label={titleCase(grn.purchaseOrder.status)} /></div>
      </div>
      <h4 className="text-body-sm font-semibold mt-4 mb-2">Line items</h4>
      {grn.lines.map((li) => (
        <div key={li.lineNumber} className={`p-3 rounded-lg border ${li.inspectionStatus === "REJECTED" ? "border-danger/30 bg-danger/5" : "border-border"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <StatusBadge {...kindBadge(li.material.kind)} />
              <span className="text-body-md font-medium">{li.material.name}</span>
            </div>
            <StatusBadge {...qcBadge(li.inspectionStatus)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-body-sm">
            <div><span className="text-muted-foreground">Batch #</span> <span className="identifier text-foreground">{li.lot?.lotNumber ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Supplier lot</span> <span className="identifier">{dash(li.supplierLotNumber)}</span></div>
            <div><span className="text-muted-foreground">Qty</span> <span className="tabular-nums">{fmtQty(li.receivedQty)} {li.uom}</span></div>
            {/* Heat numbers are not stored yet. */}
            <div><span className="text-muted-foreground">Heat #</span> <span className="identifier">—</span></div>
            <div><span className="text-muted-foreground">CoA ref</span> <span>{dash(li.coaReference)}</span></div>
            <div><span className="text-muted-foreground">Inspector</span> <span>{dash(li.inspectorName)}</span></div>
            <div><span className="text-muted-foreground">Location</span> <span>{li.storageLocation || li.bin ? `${dash(li.storageLocation)} / ${dash(li.bin)}` : "—"}</span></div>
            <div><span className="text-muted-foreground">Inspected</span> <span>{fmtDate(li.inspectionDate)}</span></div>
          </div>
        </div>
      ))}
    </>
  );
}

function SODrawerContent({ salesOrderId }: { salesOrderId: string }) {
  const q = useQuery({
    queryKey: ["sales-order", salesOrderId],
    queryFn: ({ signal }) => apiGet<SalesOrderDetail>(`/sales-orders/${salesOrderId}`, undefined, { signal }),
  });
  if (q.isPending) return <LoadingLines rows={6} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const so = q.data;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">SO number</span><span className="identifier text-foreground font-semibold">{so.orderNumber}</span></div>
        <div><span className="text-muted-foreground block">Customer</span><span className="font-medium">{so.customer.name}</span></div>
        <div><span className="text-muted-foreground block">Type</span><StatusBadge status="blue" label={titleCase(so.customer.type)} /></div>
        <div><span className="text-muted-foreground block">Date</span><span>{fmtDate(so.orderDate)}</span></div>
        <div><span className="text-muted-foreground block">Invoice</span><span className="identifier">{dash(so.invoiceNumber)}</span></div>
        <div><span className="text-muted-foreground block">Dispatch</span><span>{fmtDate(so.dispatchDate)}</span></div>
        <div><span className="text-muted-foreground block">Delivery</span><StatusBadge {...deliveryBadge(so.deliveryStatus)} /></div>
        <div><span className="text-muted-foreground block">Total value</span><span className="tabular-nums font-semibold">₹{so.totalAmount.toLocaleString("en-IN")}</span></div>
      </div>
      <h4 className="text-body-sm font-semibold mt-4 mb-2">Line items</h4>
      {so.lines.map((li) => (
        <div key={li.lineNumber} className="p-3 rounded-lg border border-border">
          <div className="text-body-md font-medium">{li.material.name}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-body-sm mt-1">
            <div><span className="text-muted-foreground">Qty</span> <span className="tabular-nums">{fmtQty(li.quantity)} {li.uom}</span></div>
            <div><span className="text-muted-foreground">Batch</span> <span className="identifier text-foreground">{li.lots.length ? li.lots.map(l => l.lotNumber).join(", ") : "—"}</span></div>
            <div><span className="text-muted-foreground">Unit price</span> <span className="tabular-nums">₹{li.unitPrice.toLocaleString("en-IN")}</span></div>
          </div>
        </div>
      ))}
    </>
  );
}

function VendorDrawerContent({ vendorId, grnNumber }: { vendorId: string; grnNumber?: string }) {
  const q = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: ({ signal }) => apiGet<VendorDetail>(`/vendors/${vendorId}`, undefined, { signal }),
  });
  const grnQ = useGrn(grnNumber ?? null);
  if (q.isPending) return <LoadingLines rows={6} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const v = q.data;
  const sc = v.scorecard;
  const grn = grnQ.data;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">Name</span><span className="font-semibold">{v.name}</span></div>
        <div><span className="text-muted-foreground block">Code</span><span className="identifier">{v.vendorCode ?? v.code}</span></div>
        <div><span className="text-muted-foreground block">Location</span><span>{[v.city, v.state].filter(Boolean).join(", ") || "—"}</span></div>
        <div><span className="text-muted-foreground block">ASL status</span><StatusBadge status={v.isApproved ? "green" : "red"} label={v.isApproved ? "Approved" : "Not on ASL"} /></div>
        <div><span className="text-muted-foreground block">Contact</span><span>{dash(v.contactPerson)}</span></div>
        <div><span className="text-muted-foreground block">Terms</span><span>{dash(v.paymentTerms)}</span></div>
      </div>
      <h4 className="text-body-sm font-semibold mt-4 mb-1">Approved materials</h4>
      <div className="flex flex-wrap gap-1">{v.approvedMaterials.length > 0 ? v.approvedMaterials.map(m => (
        <span key={m.code} title={m.name} className="px-2 py-0.5 bg-secondary text-foreground rounded-full text-caption identifier">{m.code}</span>
      )) : <span className="text-body-sm text-danger italic">No approved materials</span>}</div>

      <h4 className="text-body-sm font-semibold mt-4 mb-1">Quality scorecard</h4>
      {sc ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-body-sm p-3 bg-secondary/30 rounded-lg">
          <div><span className="text-muted-foreground">Defect rate</span><div className={`font-semibold ${sc.defectRatePercent === null ? "" : sc.defectRatePercent > 3 ? "text-danger" : sc.defectRatePercent > 1.5 ? "text-warning" : "text-success"}`}>{sc.defectRatePercent === null ? "—" : `${sc.defectRatePercent}%`}</div></div>
          <div><span className="text-muted-foreground">COPQ</span><div className="font-semibold text-danger">{sc.copqAmount === null ? "—" : `₹${sc.copqAmount.toLocaleString("en-IN")}`}</div></div>
          <div><span className="text-muted-foreground">OTD</span><div className={`font-semibold ${sc.onTimeDeliveryPercent === null ? "" : sc.onTimeDeliveryPercent >= 90 ? "text-success" : "text-warning"}`}>{sc.onTimeDeliveryPercent === null ? "—" : `${sc.onTimeDeliveryPercent}%`}</div></div>
          <div><span className="text-muted-foreground">Last audit</span><div>{fmtDate(sc.lastAuditDate)}{sc.auditResult && <> — <StatusBadge status={sc.auditResult === "PASS" ? "green" : sc.auditResult === "FAIL" ? "red" : "amber"} label={titleCase(sc.auditResult)} /></>}</div></div>
        </div>
      ) : <div className="text-body-sm text-muted-foreground">No scorecard recorded</div>}

      {grn && (
        <>
          <h4 className="text-body-sm font-semibold mt-4 mb-1">GRN {grn.grnNumber}</h4>
          <div className="text-body-sm space-y-1">
            {grn.lines.map((li) => (
              <div key={li.lineNumber} className="p-2 bg-secondary/20 rounded flex justify-between">
                <span>{li.material.name} — {fmtQty(li.receivedQty)} {li.uom}</span>
                <span className="identifier text-body-sm">{dash(li.supplierLotNumber)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h4 className="text-body-sm font-semibold mt-4 mb-1">SCAR history</h4>
      <div className="text-body-sm text-muted-foreground">Supplier corrective actions aren't tracked in Anvaya yet.</div>
    </>
  );
}

function QCDrawerContent({ lotId }: { lotId: string }) {
  const q = useLotDetail(lotId);
  if (q.isPending) return <LoadingLines rows={5} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const lot = q.data;
  const tested = lot.receipt?.inspectionDate ?? lot.releaseDate;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">Batch</span><span className="identifier text-foreground font-semibold">{lot.lotNumber}</span></div>
        <div><span className="text-muted-foreground block">QC lot</span><span className="identifier">—</span></div>
        <div><span className="text-muted-foreground block">Product</span><span className="font-medium">{lot.material.name}</span></div>
        <div><span className="text-muted-foreground block">Test date</span><span>{fmtDate(tested)}</span></div>
        <div><span className="text-muted-foreground block">Overall</span><StatusBadge {...qcBadge(lot.qcStatus)} /></div>
        <div><span className="text-muted-foreground block">Released</span><span>{lot.releaseDate ? `${fmtDate(lot.releaseDate)}${lot.releasedBy ? ` by ${lot.releasedBy}` : ""}` : "—"}</span></div>
      </div>
      <h4 className="text-body-sm font-semibold mt-4 mb-2">Test parameters</h4>
      <div className="rounded-lg border border-border">
        <EmptyState title="No test results recorded" description="QC test parameters aren't stored in Anvaya yet. The overall status above is the lot's recorded QC status." className="py-8" />
      </div>
    </>
  );
}

function ContainmentDrawerContent({ lotId }: { lotId: string }) {
  const q = useLotDetail(lotId);
  if (q.isPending) return <LoadingLines rows={8} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const lot = q.data;

  const inputs = lot.production?.inputs ?? [];
  const suspectInputs = inputs.filter(i => i.suspect && i.lot);
  const nonAslInputs = inputs.filter(i => i.nonApprovedVendor && i.lot);

  const totalDispatched = lot.dispatches.reduce((s, c) => s + c.quantity, 0);
  const atRiskField = lot.dispatches.filter(c => c.deliveryStatus === "DELIVERED").reduce((s, c) => s + c.quantity, 0);
  const ratio = totalDispatched > 0 ? (atRiskField / totalDispatched) * 100 : 0;
  const priority = ratio > 8 ? "Critical" : ratio > 4 ? "High" : "Monitor";
  const prColor = priority === "Critical" ? "red" : priority === "High" ? "amber" : "gray";

  return (
    <>
      <div className="p-3 rounded-lg border border-danger/30 bg-danger/5 mb-4">
        <div className="flex items-center gap-2 text-danger text-body-md font-semibold"><AlertTriangle className="w-4 h-4" /> Containment required</div>
        <div className="text-body-sm text-muted-foreground mt-1">Batch {lot.lotNumber} — {lot.material.name} — QC Status: {qcBadge(lot.qcStatus).label}</div>
      </div>

      <h4 className="text-body-sm font-semibold mb-2">Suspect inputs</h4>
      {suspectInputs.length > 0 ? suspectInputs.map(inp => (
        <div key={inp.lot!.id} className="p-2 rounded border border-danger/20 bg-danger/5 text-body-sm mb-1">
          <span className="identifier text-danger">{inp.lot!.lotNumber}</span> — {inp.material.name} — QC: <StatusBadge status="red" label={qcBadge(inp.lot!.qcStatus).label} /> — {inp.lot!.vendor?.name ?? "—"}
        </div>
      )) : <div className="text-body-sm text-muted-foreground">{lot.production ? "No suspect input lots — QC status is at this lot's level" : "Purchased lot — no production inputs to check"}</div>}

      {nonAslInputs.length > 0 && (
        <>
          <h4 className="text-body-sm font-semibold mt-3 mb-2">Non-ASL inputs</h4>
          {nonAslInputs.map(inp => (
            <div key={inp.lot!.id} className="p-2 rounded border border-warning/20 bg-warning/5 text-body-sm mb-1">
              <span className="identifier text-warning">{inp.lot!.lotNumber}</span> — {inp.material.name} — Vendor: {inp.lot!.vendor?.name} (Not on ASL)
            </div>
          ))}
        </>
      )}

      <h4 className="text-body-sm font-semibold mt-4 mb-2">Dispatch status</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center mb-3">
        <div className="p-2 bg-secondary/30 rounded"><div className="text-display-lg font-semibold tabular-nums">{fmtQty(lot.remainingQty)}</div><div className="text-caption text-muted-foreground">In stock</div></div>
        <div className="p-2 bg-secondary/30 rounded"><div className="text-display-lg font-semibold tabular-nums">{fmtQty(totalDispatched)}</div><div className="text-caption text-muted-foreground">Dispatched</div></div>
        <div className="p-2 bg-danger/10 rounded"><div className="text-display-lg font-semibold tabular-nums text-danger">{fmtQty(atRiskField)}</div><div className="text-caption text-muted-foreground">At risk (field)</div></div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-body-sm text-muted-foreground">Containment priority:</span>
        <StatusBadge status={prColor} label={`${priority} (${ratio.toFixed(1)}%)`} />
      </div>
      <div className="w-full bg-secondary rounded-full h-2 mb-4">
        <div className="bg-danger rounded-full h-2 transition-all" style={{ width: `${Math.min(ratio, 100)}%` }} />
      </div>

      <h4 className="text-body-sm font-semibold mb-2">Dispatched units by customer</h4>
      {lot.dispatches.length > 0 ? (
        <table className="data-table w-full text-body-sm">
          <thead><tr className="border-b border-border">
            {["Customer", "Qty", "Invoice", "Status"].map(h => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>{lot.dispatches.map((c, i) => (
            <tr key={i} className="border-b border-border">
              <td className="px-2 py-1.5 font-medium">{c.customer}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtQty(c.quantity)}</td>
              <td className="px-2 py-1.5 identifier text-body-sm">{dash(c.invoiceNumber)}</td>
              <td className="px-2 py-1.5"><StatusBadge {...deliveryBadge(c.deliveryStatus)} /></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="text-body-sm text-muted-foreground">No recorded dispatches from this lot</div>}

      <div className="flex gap-2 mt-4">
        <button disabled title="Containment actions aren't available yet" className="flex-1 h-8 bg-warning text-warning-foreground rounded-lg text-body-sm font-medium flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"><Ban className="w-3 h-3" />Place dispatch hold</button>
        <button disabled title="Containment actions aren't available yet" className="flex-1 h-8 bg-danger text-danger-foreground rounded-lg text-body-sm font-medium flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"><AlertTriangle className="w-3 h-3" />Raise quality event</button>
      </div>
      <p className="text-caption text-muted-foreground text-center">Containment actions aren't available yet.</p>
    </>
  );
}

function ProductDrawerContent({ lotId }: { lotId: string }) {
  const q = useLotDetail(lotId);
  if (q.isPending) return <LoadingLines rows={6} />;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const lot = q.data;
  const bom = lot.production?.bom ?? null;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">Product</span><span className="font-semibold">{lot.material.name}</span></div>
        <div><span className="text-muted-foreground block">Code</span><span className="identifier">{lot.material.code}</span></div>
        <div><span className="text-muted-foreground block">Formula</span><span className="identifier">{bom?.code ?? "—"}</span></div>
        <div><span className="text-muted-foreground block">Revision</span><span className="identifier font-semibold">{bom?.version ?? "—"}</span></div>
      </div>
      <h4 className="text-body-sm font-semibold mt-4 mb-2">Approved ingredient list (from formula)</h4>
      {lot.production ? (
        <table className="data-table w-full text-body-sm">
          <thead><tr className="border-b border-border">
            {["Material", "Code", "Qty used", "Type"].map(h => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {lot.production.inputs.map((inp) => (
              <tr key={inp.material.id} className="border-b border-border">
                <td className="px-2 py-1.5 font-medium">{inp.material.name}</td>
                <td className="px-2 py-1.5 identifier text-body-sm text-foreground">{inp.material.code}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {inp.issuedQty > 0
                    ? `${fmtQty(inp.issuedQty)} ${inp.uom}`
                    : <span title="No issue recorded — quantity the work order required">{fmtQty(inp.requiredQty)} {inp.uom} <span className="text-muted-foreground">(required)</span></span>}
                </td>
                <td className="px-2 py-1.5"><StatusBadge {...kindBadge(inp.material.kind)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="rounded-lg border border-border">
          <EmptyState title="Purchased material — no formula" description="This lot was received from a supplier, not produced, so there is no ingredient list." className="py-8" />
        </div>
      )}
    </>
  );
}

// ─── Backward trace rows ───
interface BackRow {
  key: string;
  kind: string;
  materialCode: string;
  materialName: string;
  qty: React.ReactNode;
  lotId: string | null;
  lotNumber: string | null;
  vendor: VendorRef | null;
  receipt: ReceiptRef | null;
  supplierLotNumber: string | null;
  coaReference: string | null;
  qcStatus: QcStatus | null;
  location: string;
  suspect: boolean;
  nonApproved: boolean;
}

function backwardRows(lot: LotDetail): BackRow[] {
  const where = (s: string | null, b: string | null) => (s || b ? `${dash(s)} / ${dash(b)}` : "—");

  if (lot.production) {
    return lot.production.inputs.map((inp) => ({
      key: inp.material.id,
      kind: inp.material.kind,
      materialCode: inp.material.code,
      materialName: inp.material.name,
      qty: inp.issuedQty > 0
        ? `${fmtQty(inp.issuedQty)} ${inp.uom}`
        : <span title="No issue recorded — quantity the work order required">{fmtQty(inp.requiredQty)} {inp.uom} req.</span>,
      lotId: inp.lot?.id ?? null,
      lotNumber: inp.lot?.lotNumber ?? null,
      vendor: inp.lot?.vendor ?? null,
      receipt: inp.lot?.receipt ?? null,
      supplierLotNumber: inp.lot?.supplierLotNumber ?? null,
      coaReference: inp.lot?.coaReference ?? null,
      qcStatus: inp.lot?.qcStatus ?? null,
      location: inp.lot ? where(inp.lot.storageLocation, inp.lot.bin) : "—",
      suspect: inp.suspect,
      nonApproved: inp.nonApprovedVendor,
    }));
  }

  // A purchased lot's backward trace is its own receipt.
  if (lot.source === "PURCHASED") {
    return [{
      key: lot.id,
      kind: lot.material.kind,
      materialCode: lot.material.code,
      materialName: lot.material.name,
      qty: `${fmtQty(lot.receivedQty)} ${lot.uom}`,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      vendor: lot.vendor,
      receipt: lot.receipt,
      supplierLotNumber: lot.supplierLotNumber,
      coaReference: lot.coaReference,
      qcStatus: lot.qcStatus,
      location: where(lot.storageLocation, lot.bin),
      suspect: needsContainment(lot.qcStatus),
      nonApproved: lot.vendor ? !lot.vendor.isApproved : false,
    }];
  }

  return [];
}

// ─── Traceability panel ───
function TraceabilityPanel({ lotId, setDrawer }: { lotId: string; setDrawer: (d: DrawerType) => void }) {
  const q = useLotDetail(lotId);
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const toggleInput = (key: string) => setExpandedInputs(prev => ({ ...prev, [key]: !prev[key] }));

  if (q.isPending) return <div><LoadingLines rows={5} /></div>;
  if (q.error) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;

  const lot = q.data;
  const rows = backwardRows(lot);
  const forwardCount = lot.dispatches.length + lot.usedIn.length;
  const formula = lot.production?.bom ? `${lot.production.bom.code} ${lot.production.bom.version}` : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-body-md font-semibold">
          Traceability: <button onClick={() => setDrawer({ kind: "product", lotId: lot.id })} className="text-foreground underline underline-offset-2 hover:text-foreground">{lot.lotNumber}</button>
          <span className="text-muted-foreground font-normal ml-2">— {lot.material.name}{formula ? ` — ${formula}` : ""}</span>
        </h3>
        <div className="flex items-center gap-2">
          {needsContainment(lot.qcStatus) && (
            <button onClick={() => setDrawer({ kind: "containment", lotId: lot.id })} className="h-7 px-2.5 bg-danger text-danger-foreground rounded text-body-sm font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Containment
            </button>
          )}
          <button onClick={() => setDrawer({ kind: "qc", lotId: lot.id })} className={btnSecondarySm}>QC report</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body-md">
        {/* Backward Trace */}
        <div>
          <h4 className="text-body-sm font-semibold text-muted-foreground mb-2">
            ← Backward Trace ({lot.production ? `${rows.length} inputs` : rows.length ? "supplier receipt" : "no source recorded"})
          </h4>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.key} className={`rounded-lg border text-body-sm ${r.suspect ? "border-danger/30 bg-danger/5" : r.nonApproved ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                <div className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer" onClick={() => toggleInput(r.key)}>
                  {expandedInputs[r.key] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <StatusBadge {...kindBadge(r.kind)} />
                  {r.lotNumber
                    ? (r.receipt
                      ? <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "grn", grnNumber: r.receipt!.grnNumber }); }} className="identifier text-foreground hover:underline">{r.lotNumber}</button>
                      : <span className="identifier text-foreground">{r.lotNumber}</span>)
                    : <span className="text-muted-foreground italic">No lot recorded</span>}
                  <span className="font-medium truncate">{r.materialName}</span>
                  <span className="tabular-nums text-muted-foreground ml-auto">{r.qty}</span>
                  {r.suspect && <AlertTriangle className="w-3 h-3 text-danger" />}
                  {r.nonApproved && <AlertTriangle className="w-3 h-3 text-warning" />}
                </div>
                {expandedInputs[r.key] && (
                  <div className="px-2.5 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-caption border-t border-border/50 pt-1.5 ml-5">
                    {r.lotNumber ? (
                      <>
                        <div><span className="text-muted-foreground">Supplier</span> {r.vendor
                          ? <button onClick={() => setDrawer({ kind: "vendor", vendorId: r.vendor!.id, grnNumber: r.receipt?.grnNumber })} className="text-foreground underline underline-offset-2 hover:text-foreground">{r.vendor.name}</button>
                          : "—"}</div>
                        <div><span className="text-muted-foreground">GRN</span> {r.receipt
                          ? <button onClick={() => setDrawer({ kind: "grn", grnNumber: r.receipt!.grnNumber })} className="text-foreground underline underline-offset-2 hover:text-foreground">{r.receipt.grnNumber}</button>
                          : <span>No receipt recorded</span>}</div>
                        <div><span className="text-muted-foreground">Supplier lot</span> <span className="identifier">{dash(r.supplierLotNumber)}</span></div>
                        <div><span className="text-muted-foreground">CoA</span> <span>{dash(r.coaReference)}</span></div>
                        <div><span className="text-muted-foreground">PO</span> <span className="identifier">{r.receipt?.purchaseOrderNumber ?? "—"}</span></div>
                        <div><span className="text-muted-foreground">QC</span> {r.qcStatus ? <StatusBadge {...qcBadge(r.qcStatus)} /> : "—"}</div>
                        <div><span className="text-muted-foreground">Location</span> <span>{r.location}</span></div>
                        {r.nonApproved && <div className="col-span-2 text-warning font-semibold">⚠ Supplier not on ASL for {r.materialCode}</div>}
                        {r.suspect && r.qcStatus && <div className="col-span-2 text-danger font-semibold">⚠ Lot QC: {qcBadge(r.qcStatus).label} — suspect material</div>}
                      </>
                    ) : (
                      <div className="col-span-2 text-muted-foreground">The work order has no lot recorded for {r.materialCode}, so this input can't be traced to a supplier.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {rows.length === 0 && (
              <div className="px-2.5 py-1.5 rounded-lg border border-border text-body-sm text-muted-foreground">No receipt or production record for this lot</div>
            )}
            {/* QC */}
            <div className="px-2.5 py-1.5 rounded-lg border border-border text-body-sm flex items-center gap-2">
              <span className={lot.qcStatus === "APPROVED" ? "text-success" : "text-warning"}>{lot.qcStatus === "APPROVED" ? "✅" : "⚠"}</span>
              <span>QC:</span>
              <button onClick={() => setDrawer({ kind: "qc", lotId: lot.id })} className="text-foreground hover:underline">{qcBadge(lot.qcStatus).label}</button>
              <span className="text-muted-foreground">— no test results recorded{lot.releaseDate ? ` — released ${fmtDate(lot.releaseDate)}` : ""}</span>
            </div>
          </div>
        </div>

        {/* Forward Trace */}
        <div>
          <h4 className="text-body-sm font-semibold text-muted-foreground mb-2">Forward Trace → ({forwardCount} orders)</h4>
          <div className="space-y-1.5">
            {lot.dispatches.map((d, i) => (
              <div key={`${d.salesOrderId}-${i}`} className="px-2.5 py-1.5 rounded-lg border border-border text-body-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">📤</span>
                <button onClick={() => setDrawer({ kind: "so", salesOrderId: d.salesOrderId })} className="identifier text-foreground hover:underline">{d.orderNumber}</button>
                <span className="font-medium">{d.customer}</span>
                <span className="tabular-nums">{fmtQty(d.quantity)} {lot.uom}</span>
                <span className="identifier text-caption text-muted-foreground">{dash(d.invoiceNumber)}</span>
                <StatusBadge {...deliveryBadge(d.deliveryStatus)} />
                <span className="text-muted-foreground">{fmtDate(d.dispatchedAt)}</span>
              </div>
            ))}
            {lot.usedIn.map((u) => (
              <div key={u.workOrderId} className="px-2.5 py-1.5 rounded-lg border border-border text-body-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">🏭</span>
                <span className="identifier text-foreground">{u.orderNumber}</span>
                <span className="font-medium">{u.product.name}</span>
                <span className="tabular-nums">{u.issuedQty > 0 ? `${fmtQty(u.issuedQty)} ${lot.uom} issued` : "used — no issue quantity recorded"}</span>
                <StatusBadge status="gray" label={titleCase(u.status)} />
              </div>
            ))}
            {forwardCount === 0 && (
              <div className="px-2.5 py-1.5 rounded-lg border border-border text-body-sm text-muted-foreground">No recorded dispatches or production use</div>
            )}
            {/* Remaining stock */}
            <div className="px-2.5 py-1.5 rounded-lg border border-border bg-secondary/20 text-body-sm flex items-center gap-2">
              <span>📍</span>
              <span>Remaining: <strong className="tabular-nums">{fmtQty(lot.remainingQty)} {lot.uom}</strong> in {lot.location.name} ({dash(lot.bin)})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function BatchTracking() {
  const [search, setSearch] = useState("");
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerType>(null);

  const term = useDeferredValue(search.trim());
  // "GRN-xxxx" opens the receipt instead of filtering the register.
  const grnSearch = /^GRN-/i.test(term) && term.length >= 8 ? term.toUpperCase() : null;

  const lotsQuery = useQuery({
    queryKey: ["inventory", "lots", grnSearch ? "" : term],
    queryFn: ({ signal }) => apiGet<LotRow[]>("/inventory/lots", { q: grnSearch ? undefined : term, limit: 500 }, { signal }),
  });

  const indicatorsQuery = useQuery({
    queryKey: ["inventory", "lots", "indicators"],
    queryFn: ({ signal }) => apiGet<LotIndicators>("/inventory/lots/indicators", undefined, { signal }),
  });

  const lots = useMemo(() => lotsQuery.data ?? [], [lotsQuery.data]);
  const indicators = indicatorsQuery.data;

  // Keep a selection whenever the register has rows: the current one if it is
  // still listed, otherwise the first match — as the search always did.
  useEffect(() => {
    if (!lotsQuery.data) return;
    setSelectedLotId(prev => (prev && lotsQuery.data.some(l => l.id === prev) ? prev : lotsQuery.data[0]?.id ?? null));
  }, [lotsQuery.data]);

  const selectLot = (id: string) => { setSelectedLotId(id); setSearch(""); };

  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
  const containment = indicators?.containmentLots;

  return (
    <div className="px-6 py-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Batch & serial tracking</span>
        </h1>
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, material, or GRN-xxxx..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-card text-body-md" />
        </div>
      </div>

      {/* Completeness Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><Shield className="w-5 h-5 text-success" /></div>
          <div><div className="text-body-sm text-muted-foreground">Backward trace complete</div><div className="text-display-lg font-semibold tabular-nums text-success">{pct(indicators?.backwardPct)}</div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
          <div><div className="text-body-sm text-muted-foreground">Forward trace complete</div><div className="text-display-lg font-semibold tabular-nums text-foreground">{pct(indicators?.forwardPct)}</div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${containment ? "bg-danger/10" : "bg-success/10"}`}>
            <AlertTriangle className={`w-5 h-5 ${containment ? "text-danger" : "text-success"}`} />
          </div>
          <div><div className="text-body-sm text-muted-foreground">Open containment actions</div><div className={`text-display-lg font-semibold tabular-nums ${containment ? "text-danger" : "text-success"}`}>{containment ?? "—"}</div></div>
        </div>
      </div>

      {/* GRN Search Result */}
      {grnSearch && <GRNSearchResult grnNumber={grnSearch} onClose={() => setSearch("")} onSelectLot={selectLot} />}

      {/* Traceability Panel */}
      {selectedLotId && !grnSearch && <TraceabilityPanel key={selectedLotId} lotId={selectedLotId} setDrawer={setDrawer} />}

      {/* Main Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Batch Register Table */}
        <div className="col-span-2 overflow-hidden">
          {lotsQuery.error ? (
            <LoadError error={lotsQuery.error} onRetry={() => void lotsQuery.refetch()} />
          ) : lotsQuery.isPending ? (
            <SkeletonTable rows={6} cols={8} />
          ) : lots.length === 0 ? (
            <EmptyState
              title={term && !grnSearch ? "No lots match your search" : "No lots recorded yet"}
              description={term && !grnSearch ? "Try a lot number, material, location or supplier." : "Lots appear here when goods are received or produced."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-body-md">
                <thead><tr className="border-b border-border">
                  {["Batch", "Material", "Qty", "Mfg / receipt", "Expiry", "Warehouse", "Bin", "Formula rev", "Inputs", "QC", "Age"].map(h =>
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {lots.map(b => {
                    const isContainment = needsContainment(b.qcStatus);
                    return (
                      <tr key={b.id} className={`border-b border-border hover:bg-sunken cursor-pointer ${selectedLotId === b.id ? "bg-sunken" : ""} ${isContainment ? "bg-danger/3" : ""}`}
                        onClick={() => setSelectedLotId(b.id)}>
                        <td className="px-3 py-2 identifier text-body-sm text-foreground whitespace-nowrap">{b.lotNumber}</td>
                        <td className="px-3 py-2 font-medium [overflow-wrap:normal]">
                          <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "product", lotId: b.id }); }} className="hover:underline text-left">{b.material.name}</button>
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtQty(b.receivedQty)} {b.uom}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.receiptDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.expiryDate)}</td>
                        <td className="px-3 py-2 [overflow-wrap:normal]">{b.location.name}</td>
                        <td className="px-3 py-2 identifier text-body-sm whitespace-nowrap">{dash(b.bin)}</td>
                        <td className="px-3 py-2 identifier text-body-sm">{b.workOrder?.bomVersion ?? "—"}</td>
                        <td className="px-3 py-2">
                          {b.inputCount !== null ? (
                            <button onClick={e => { e.stopPropagation(); setSelectedLotId(b.id); }}
                              className="px-1.5 py-0.5 bg-secondary text-foreground rounded text-caption font-semibold hover:bg-sunken whitespace-nowrap">{b.inputCount} inputs</button>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "qc", lotId: b.id }); }}>
                            <StatusBadge {...qcBadge(b.qcStatus)} />
                          </button>
                          {isContainment && (
                            <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "containment", lotId: b.id }); }}
                              className="ml-1 text-danger"><AlertTriangle className="w-3 h-3 inline" /></button>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{b.ageDays}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expiring Batches */}
        <div>
          <h3 className="text-body-md font-semibold mb-3 text-danger">Expiring within {indicators?.expiryWindowDays ?? 30} days</h3>
          <div className="space-y-3">
            {indicatorsQuery.error ? (
              <LoadError error={indicatorsQuery.error} onRetry={() => void indicatorsQuery.refetch()} />
            ) : indicatorsQuery.isPending ? (
              <LoadingLines rows={3} />
            ) : indicators && indicators.expiring.length > 0 ? indicators.expiring.map(b => (
              <div key={b.id} className="p-2.5 rounded-lg bg-danger/5 border border-danger/10 cursor-pointer" onClick={() => selectLot(b.id)}>
                <div className="text-body-sm identifier text-foreground">{b.lotNumber}</div>
                <div className="text-body-md font-medium">{b.material}</div>
                <div className="text-body-sm text-muted-foreground">{fmtQty(b.remainingQty)} {b.uom} · Expires {fmtDate(b.expiryDate)} · {b.daysLeft}d left · {lakh(b.value)}</div>
              </div>
            )) : <div className="text-body-sm text-muted-foreground py-4 text-center">No batches expiring within {indicators?.expiryWindowDays ?? 30} days</div>}
          </div>
        </div>
      </div>

      {/* Side Drawer */}
      {drawer && <SideDrawer drawer={drawer} onClose={() => setDrawer(null)} onNavigate={setDrawer} />}
    </div>
  );
}
