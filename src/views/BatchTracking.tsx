import { useState, useMemo } from "react";
import StatusBadge from "@/components/StatusBadge";
import { Search, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, Shield, Package, X, FileText, Ban } from "lucide-react";
import { productionBatches, getProductionBatch, getBatchesByRMBatch } from "@/data/production_batches";
import { rmBatches, getRMBatch } from "@/data/rm_batches";
import { grns, getGRN, getGRNsByRMBatch } from "@/data/grn";
import { purchaseOrders, getPO } from "@/data/purchase_orders";
import { salesOrders, getSOsByBatch } from "@/data/sales_orders";
import { vendors as vendorData, getVendor } from "@/data/vendors";

// ─── Helpers ───
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// ─── Expiring within 30 days from "today" (2026-03-31) ───
const today = "2026-03-31";
const expiringBatches = productionBatches.filter(b => {
  const daysToExpiry = daysBetween(today, b.expiry_date);
  return daysToExpiry >= 0 && daysToExpiry <= 30;
});

// ─── Completeness calculations ───
function calcCompleteness() {
  let backwardComplete = 0;
  let forwardComplete = 0;
  let containmentActions = 0;
  const total = productionBatches.length;

  for (const pb of productionBatches) {
    // Backward: every RM/PM input has a valid GRN + CoA
    const allInputs = [...pb.rm_consumption, ...pb.pm_consumption];
    const backOk = allInputs.every(inp => {
      const rm = getRMBatch(inp.rm_batch_number);
      return rm && getGRN(rm.grn_number) && rm.coa_reference;
    });
    if (backOk) backwardComplete++;

    // Forward: all dispatched qty accounted for in SOs
    const sos = getSOsByBatch(pb.batch_number);
    const totalSOQty = sos.reduce((s, so) => s + so.line_items.filter(li => li.batch_number === pb.batch_number).reduce((a, li) => a + li.quantity, 0), 0);
    if (totalSOQty >= pb.quantity_dispatched) forwardComplete++;

    // Containment
    if (pb.qc_status === "Quarantine" || pb.qc_status === "Failed") containmentActions++;
  }

  return {
    backwardPct: Math.round((backwardComplete / total) * 100),
    forwardPct: Math.round((forwardComplete / total) * 100),
    containmentActions,
  };
}

// ─── Drawer Types ───
type DrawerType =
  | { kind: "grn"; grnNumber: string }
  | { kind: "so"; soNumber: string }
  | { kind: "vendor"; vendorId: string; grnNumber?: string }
  | { kind: "qc"; batchNumber: string }
  | { kind: "containment"; batchNumber: string }
  | { kind: "product"; batchNumber: string }
  | null;

// ─── GRN Search result component ───
function GRNSearchResult({ grnNumber, onClose }: { grnNumber: string; onClose: () => void }) {
  const grn = getGRN(grnNumber);
  if (!grn) return <div className="p-4 text-sm text-muted-foreground">GRN not found: {grnNumber}</div>;
  const po = getPO(grn.purchase_order_number);
  // Find all production batches that consumed RM/PM from this GRN
  const producedFrom = grn.line_items.flatMap(li => getBatchesByRMBatch(li.rm_batch_number));
  const unique = [...new Map(producedFrom.map(b => [b.batch_number, b])).values()];

  return (
    <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">GRN Detail: <span className="text-accent font-mono">{grnNumber}</span></h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-4">
        <div><span className="text-muted-foreground">PO Number</span><div className="font-mono text-accent">{grn.purchase_order_number}</div></div>
        <div><span className="text-muted-foreground">Vendor</span><div className="font-medium">{grn.vendor_name}</div></div>
        <div><span className="text-muted-foreground">Receipt Date</span><div>{fmtDate(grn.grn_date)}</div></div>
      </div>
      <table className="w-full text-[12px] mb-4">
        <thead><tr className="bg-secondary/50 border-b border-border">
          {["Material", "Type", "Qty", "RM Batch #", "Supplier Lot", "Inspection", "CoA"].map(h =>
            <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
        </tr></thead>
        <tbody>{grn.line_items.map((li, i) => (
          <tr key={i} className="border-b border-border">
            <td className="px-2 py-1.5 font-medium">{li.material_name}</td>
            <td className="px-2 py-1.5"><StatusBadge status={li.material_type === "RM" ? "green" : "blue"} label={li.material_type} /></td>
            <td className="px-2 py-1.5 tabular-nums">{li.quantity} {li.unit}</td>
            <td className="px-2 py-1.5 font-mono text-accent">{li.rm_batch_number}</td>
            <td className="px-2 py-1.5 font-mono text-xs">{li.supplier_lot_number}</td>
            <td className="px-2 py-1.5"><StatusBadge status={li.inspection_status === "passed" ? "green" : li.inspection_status === "failed" ? "red" : "amber"} label={li.inspection_status} /></td>
            <td className="px-2 py-1.5 text-muted-foreground">{li.coa_reference}</td>
          </tr>
        ))}</tbody>
      </table>
      {unique.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Batches Produced Using These Inputs</h4>
          <div className="space-y-1">{unique.map(b => (
            <div key={b.batch_number} className="flex items-center gap-3 text-xs p-1.5 rounded bg-secondary/30">
              <span className="font-mono text-accent">{b.batch_number}</span>
              <span className="font-medium">{b.product_name}</span>
              <span className="tabular-nums">{b.quantity_produced.toLocaleString()} {b.unit}</span>
              <StatusBadge status={b.qc_status === "Approved" ? "green" : b.qc_status === "Quarantine" ? "amber" : "red"} label={b.qc_status} />
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

// ─── Side Drawer ───
function SideDrawer({ drawer, onClose, onNavigate }: { drawer: NonNullable<DrawerType>; onClose: () => void; onNavigate: (d: DrawerType) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/20" />
      <div className="relative w-[520px] max-w-full h-full bg-card border-l border-border shadow-xl overflow-y-auto animate-slide-in-left" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold">
            {drawer.kind === "grn" && `GRN Detail`}
            {drawer.kind === "so" && `Sales Order Detail`}
            {drawer.kind === "vendor" && `Vendor Detail`}
            {drawer.kind === "qc" && `QC Report`}
            {drawer.kind === "containment" && `Containment Panel`}
            {drawer.kind === "product" && `Product / Formula Detail`}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {drawer.kind === "grn" && <GRNDrawerContent grnNumber={drawer.grnNumber} onNavigate={onNavigate} />}
          {drawer.kind === "so" && <SODrawerContent soNumber={drawer.soNumber} />}
          {drawer.kind === "vendor" && <VendorDrawerContent vendorId={drawer.vendorId} grnNumber={drawer.grnNumber} />}
          {drawer.kind === "qc" && <QCDrawerContent batchNumber={drawer.batchNumber} />}
          {drawer.kind === "containment" && <ContainmentDrawerContent batchNumber={drawer.batchNumber} />}
          {drawer.kind === "product" && <ProductDrawerContent batchNumber={drawer.batchNumber} />}
        </div>
      </div>
    </div>
  );
}

function GRNDrawerContent({ grnNumber, onNavigate }: { grnNumber: string; onNavigate: (d: DrawerType) => void }) {
  const grn = getGRN(grnNumber);
  if (!grn) return <p className="text-sm text-muted-foreground">Not found</p>;
  const po = getPO(grn.purchase_order_number);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground block">GRN Number</span><span className="font-mono text-accent font-semibold">{grn.grn_number}</span></div>
        <div><span className="text-muted-foreground block">Receipt Date</span><span>{fmtDate(grn.grn_date)}</span></div>
        <div><span className="text-muted-foreground block">PO Number</span><span className="font-mono text-accent">{grn.purchase_order_number}</span></div>
        <div><span className="text-muted-foreground block">Vendor</span>
          <button onClick={() => onNavigate({ kind: "vendor", vendorId: grn.vendor_id, grnNumber })} className="text-accent underline">{grn.vendor_name}</button>
        </div>
        {po && <>
          <div><span className="text-muted-foreground block">PO Value</span><span className="tabular-nums">₹{po.line_items.reduce((s, li) => s + li.ordered_qty * li.unit_price, 0).toLocaleString()}</span></div>
          <div><span className="text-muted-foreground block">PO Status</span><StatusBadge status="green" label={po.status} /></div>
        </>}
      </div>
      <h4 className="text-xs font-semibold mt-4 mb-2">Line Items</h4>
      {grn.line_items.map((li, i) => (
        <div key={i} className={`p-3 rounded-md border ${li.inspection_status === "failed" ? "border-danger/30 bg-danger/5" : "border-border"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={li.material_type === "RM" ? "green" : "blue"} label={li.material_type} />
              <span className="text-sm font-medium">{li.material_name}</span>
            </div>
            <StatusBadge status={li.inspection_status === "passed" ? "green" : li.inspection_status === "failed" ? "red" : "amber"} label={li.inspection_status} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Batch #</span> <span className="font-mono text-accent">{li.rm_batch_number}</span></div>
            <div><span className="text-muted-foreground">Supplier Lot</span> <span className="font-mono">{li.supplier_lot_number}</span></div>
            <div><span className="text-muted-foreground">Qty</span> <span className="tabular-nums">{li.quantity} {li.unit}</span></div>
            <div><span className="text-muted-foreground">Heat #</span> <span className="font-mono">{li.heat_number}</span></div>
            <div><span className="text-muted-foreground">CoA Ref</span> <span>{li.coa_reference}</span></div>
            <div><span className="text-muted-foreground">Inspector</span> <span>{li.inspector_name}</span></div>
            <div><span className="text-muted-foreground">Location</span> <span>{li.storage_location} / {li.bin}</span></div>
            <div><span className="text-muted-foreground">Inspected</span> <span>{fmtDate(li.inspection_date)}</span></div>
          </div>
          {Object.keys(li.coa_parameters).length > 0 && (
            <div className="mt-2 p-2 bg-secondary/30 rounded text-xs">
              <span className="font-semibold text-muted-foreground">CoA Parameters:</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {Object.entries(li.coa_parameters).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span> <span className="font-medium">{v}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function SODrawerContent({ soNumber }: { soNumber: string }) {
  const so = salesOrders.find(s => s.so_number === soNumber);
  if (!so) return <p className="text-sm text-muted-foreground">Not found</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground block">SO Number</span><span className="font-mono text-accent font-semibold">{so.so_number}</span></div>
        <div><span className="text-muted-foreground block">Customer</span><span className="font-medium">{so.customer_name}</span></div>
        <div><span className="text-muted-foreground block">Type</span><StatusBadge status="blue" label={so.customer_type} /></div>
        <div><span className="text-muted-foreground block">Date</span><span>{fmtDate(so.so_date)}</span></div>
        <div><span className="text-muted-foreground block">Invoice</span><span className="font-mono">{so.invoice_number}</span></div>
        <div><span className="text-muted-foreground block">Dispatch</span><span>{fmtDate(so.dispatch_date)}</span></div>
        <div><span className="text-muted-foreground block">Delivery</span><StatusBadge status={so.delivery_status === "delivered" ? "green" : so.delivery_status === "in_transit" ? "amber" : "gray"} label={so.delivery_status.replace("_", " ")} /></div>
        <div><span className="text-muted-foreground block">Total Value</span><span className="tabular-nums font-semibold">₹{so.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0).toLocaleString()}</span></div>
      </div>
      <h4 className="text-xs font-semibold mt-4 mb-2">Line Items</h4>
      {so.line_items.map((li, i) => (
        <div key={i} className="p-3 rounded-md border border-border">
          <div className="text-sm font-medium">{li.product_name}</div>
          <div className="grid grid-cols-3 gap-2 text-xs mt-1">
            <div><span className="text-muted-foreground">Qty</span> <span className="tabular-nums">{li.quantity.toLocaleString()} {li.unit}</span></div>
            <div><span className="text-muted-foreground">Batch</span> <span className="font-mono text-accent">{li.batch_number}</span></div>
            <div><span className="text-muted-foreground">Unit Price</span> <span className="tabular-nums">₹{li.unit_price}</span></div>
          </div>
        </div>
      ))}
    </>
  );
}

function VendorDrawerContent({ vendorId, grnNumber }: { vendorId: string; grnNumber?: string }) {
  const v = getVendor(vendorId);
  if (!v) return <p className="text-sm text-muted-foreground">Not found</p>;
  const grn = grnNumber ? getGRN(grnNumber) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground block">Name</span><span className="font-semibold">{v.vendor_name}</span></div>
        <div><span className="text-muted-foreground block">Code</span><span className="font-mono">{v.vendor_code}</span></div>
        <div><span className="text-muted-foreground block">Location</span><span>{v.location}</span></div>
        <div><span className="text-muted-foreground block">ASL Status</span><StatusBadge status={v.asl ? "green" : "red"} label={v.asl ? "Approved" : "Not on ASL"} /></div>
        <div><span className="text-muted-foreground block">Contact</span><span>{v.contact_person}</span></div>
        <div><span className="text-muted-foreground block">Terms</span><span>{v.payment_terms}</span></div>
      </div>
      <h4 className="text-xs font-semibold mt-4 mb-1">Approved Materials</h4>
      <div className="flex flex-wrap gap-1">{v.approved_materials.length > 0 ? v.approved_materials.map(m => (
        <span key={m} className="px-2 py-0.5 bg-accent/10 text-accent rounded-full text-[11px] font-mono">{m}</span>
      )) : <span className="text-xs text-danger italic">No approved materials</span>}</div>

      <h4 className="text-xs font-semibold mt-4 mb-1">Quality Scorecard</h4>
      <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-secondary/30 rounded-md">
        <div><span className="text-muted-foreground">Defect Rate</span><div className={`font-semibold ${v.quality_scorecard.defect_rate_percent > 3 ? "text-danger" : v.quality_scorecard.defect_rate_percent > 1.5 ? "text-warning" : "text-success"}`}>{v.quality_scorecard.defect_rate_percent}%</div></div>
        <div><span className="text-muted-foreground">COPQ</span><div className="font-semibold text-danger">{v.quality_scorecard.copq_amount}</div></div>
        <div><span className="text-muted-foreground">OTD</span><div className={`font-semibold ${v.quality_scorecard.on_time_delivery_percent >= 90 ? "text-success" : "text-warning"}`}>{v.quality_scorecard.on_time_delivery_percent}%</div></div>
        <div><span className="text-muted-foreground">Last Audit</span><div>{fmtDate(v.quality_scorecard.last_audit_date)} — <StatusBadge status={v.quality_scorecard.audit_result === "Pass" ? "green" : v.quality_scorecard.audit_result === "Fail" ? "red" : "amber"} label={v.quality_scorecard.audit_result} /></div></div>
      </div>

      {grn && (
        <>
          <h4 className="text-xs font-semibold mt-4 mb-1">GRN {grn.grn_number}</h4>
          <div className="text-xs space-y-1">
            {grn.line_items.map((li, i) => (
              <div key={i} className="p-2 bg-secondary/20 rounded flex justify-between">
                <span>{li.material_name} — {li.quantity} {li.unit}</span>
                <span className="font-mono text-xs">{li.supplier_lot_number}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {v.scar_history.length > 0 && (
        <>
          <h4 className="text-xs font-semibold mt-4 mb-1">SCAR History</h4>
          {v.scar_history.map(s => (
            <div key={s.scar_id} className="p-2 rounded border border-border text-xs">
              <div className="flex justify-between"><span className="font-mono text-accent">{s.scar_id}</span><StatusBadge status={s.status === "Closed" ? "green" : s.status === "Open" ? "red" : "amber"} label={s.status} /></div>
              <div className="text-muted-foreground mt-1">{s.description}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function QCDrawerContent({ batchNumber }: { batchNumber: string }) {
  const pb = getProductionBatch(batchNumber);
  if (!pb) return <p className="text-sm text-muted-foreground">Not found</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground block">Batch</span><span className="font-mono text-accent font-semibold">{pb.batch_number}</span></div>
        <div><span className="text-muted-foreground block">QC Lot</span><span className="font-mono">{pb.qc_lot_number}</span></div>
        <div><span className="text-muted-foreground block">Product</span><span className="font-medium">{pb.product_name}</span></div>
        <div><span className="text-muted-foreground block">Test Date</span><span>{fmtDate(pb.qc_date)}</span></div>
        <div><span className="text-muted-foreground block">Overall</span><StatusBadge status={pb.qc_status === "Approved" ? "green" : pb.qc_status === "Quarantine" ? "amber" : "red"} label={pb.qc_status} /></div>
      </div>
      <h4 className="text-xs font-semibold mt-4 mb-2">Test Parameters</h4>
      <table className="w-full text-[12px]">
        <thead><tr className="bg-secondary/50 border-b border-border">
          {["Parameter", "Specification", "Result", "Status"].map(h => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
        </tr></thead>
        <tbody>{pb.qc_result.map((p, i) => (
          <tr key={i} className={`border-b border-border ${p.status === "Fail" ? "bg-danger/5" : ""}`}>
            <td className="px-2 py-1.5 font-medium">{p.parameter}</td>
            <td className="px-2 py-1.5 text-muted-foreground">{p.spec}</td>
            <td className="px-2 py-1.5 tabular-nums font-semibold">{p.result}</td>
            <td className="px-2 py-1.5"><StatusBadge status={p.status === "Pass" ? "green" : "red"} label={p.status} /></td>
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}

function ContainmentDrawerContent({ batchNumber }: { batchNumber: string }) {
  const pb = getProductionBatch(batchNumber);
  if (!pb) return <p className="text-sm text-muted-foreground">Not found</p>;

  // Find suspect inputs
  const suspectInputs = pb.rm_consumption.filter(inp => {
    const rm = getRMBatch(inp.rm_batch_number);
    return rm && (rm.qc_status === "Quarantine" || rm.qc_status === "Rejected");
  });
  const nonAslInputs = pb.rm_consumption.filter(inp => {
    const rm = getRMBatch(inp.rm_batch_number);
    const v = rm ? getVendor(rm.vendor_id) : null;
    return v && !v.asl;
  });

  const sos = getSOsByBatch(pb.batch_number);
  const dispatchedByCustomer = sos.flatMap(so => so.line_items.filter(li => li.batch_number === pb.batch_number).map(li => ({
    customer: so.customer_name, qty: li.quantity, status: so.delivery_status, invoice: so.invoice_number
  })));
  const totalDispatched = dispatchedByCustomer.reduce((s, c) => s + c.qty, 0);
  const atRiskField = dispatchedByCustomer.filter(c => c.status === "delivered").reduce((s, c) => s + c.qty, 0);
  const ratio = totalDispatched > 0 ? (atRiskField / totalDispatched) * 100 : 0;
  const priority = ratio > 8 ? "Critical" : ratio > 4 ? "High" : "Monitor";
  const prColor = priority === "Critical" ? "red" : priority === "High" ? "amber" : "gray";

  return (
    <>
      <div className="p-3 rounded-md border border-danger/30 bg-danger/5 mb-4">
        <div className="flex items-center gap-2 text-danger text-sm font-semibold"><AlertTriangle className="w-4 h-4" /> Containment Required</div>
        <div className="text-xs text-muted-foreground mt-1">Batch {pb.batch_number} — {pb.product_name} — QC Status: {pb.qc_status}</div>
      </div>

      <h4 className="text-xs font-semibold mb-2">Suspect Inputs</h4>
      {suspectInputs.length > 0 ? suspectInputs.map(inp => {
        const rm = getRMBatch(inp.rm_batch_number)!;
        return (
          <div key={inp.rm_batch_number} className="p-2 rounded border border-danger/20 bg-danger/5 text-xs mb-1">
            <span className="font-mono text-danger">{inp.rm_batch_number}</span> — {inp.material_name} — QC: <StatusBadge status="red" label={rm.qc_status} /> — {rm.vendor_name}
          </div>
        );
      }) : <div className="text-xs text-muted-foreground">No suspect RM batches — QC failure at FG level</div>}

      {nonAslInputs.length > 0 && (
        <>
          <h4 className="text-xs font-semibold mt-3 mb-2">Non-ASL Inputs</h4>
          {nonAslInputs.map(inp => {
            const rm = getRMBatch(inp.rm_batch_number)!;
            return (
              <div key={inp.rm_batch_number} className="p-2 rounded border border-warning/20 bg-warning/5 text-xs mb-1">
                <span className="font-mono text-warning">{inp.rm_batch_number}</span> — {inp.material_name} — Vendor: {rm.vendor_name} (Not on ASL)
              </div>
            );
          })}
        </>
      )}

      <h4 className="text-xs font-semibold mt-4 mb-2">Dispatch Status</h4>
      <div className="grid grid-cols-3 gap-3 text-center mb-3">
        <div className="p-2 bg-secondary/30 rounded"><div className="text-lg font-bold tabular-nums">{pb.quantity_remaining.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">In Stock</div></div>
        <div className="p-2 bg-secondary/30 rounded"><div className="text-lg font-bold tabular-nums">{totalDispatched.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">Dispatched</div></div>
        <div className="p-2 bg-danger/10 rounded"><div className="text-lg font-bold tabular-nums text-danger">{atRiskField.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">At Risk (Field)</div></div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Containment Priority:</span>
        <StatusBadge status={prColor} label={`${priority} (${ratio.toFixed(1)}%)`} />
      </div>
      <div className="w-full bg-secondary rounded-full h-2 mb-4">
        <div className="bg-danger rounded-full h-2 transition-all" style={{ width: `${Math.min(ratio, 100)}%` }} />
      </div>

      <h4 className="text-xs font-semibold mb-2">Dispatched Units by Customer</h4>
      <table className="w-full text-[12px]">
        <thead><tr className="bg-secondary/50 border-b border-border">
          {["Customer", "Qty", "Invoice", "Status"].map(h => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
        </tr></thead>
        <tbody>{dispatchedByCustomer.map((c, i) => (
          <tr key={i} className="border-b border-border">
            <td className="px-2 py-1.5 font-medium">{c.customer}</td>
            <td className="px-2 py-1.5 tabular-nums">{c.qty.toLocaleString()}</td>
            <td className="px-2 py-1.5 font-mono text-xs">{c.invoice}</td>
            <td className="px-2 py-1.5"><StatusBadge status={c.status === "delivered" ? "green" : c.status === "in_transit" ? "amber" : "gray"} label={c.status.replace("_", " ")} /></td>
          </tr>
        ))}</tbody>
      </table>

      <div className="flex gap-2 mt-4">
        <button className="flex-1 h-8 bg-warning text-warning-foreground rounded-md text-xs font-medium flex items-center justify-center gap-1"><Ban className="w-3 h-3" />Place Dispatch Hold</button>
        <button className="flex-1 h-8 bg-danger text-danger-foreground rounded-md text-xs font-medium flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" />Raise Quality Event</button>
      </div>
    </>
  );
}

function ProductDrawerContent({ batchNumber }: { batchNumber: string }) {
  const pb = getProductionBatch(batchNumber);
  if (!pb) return <p className="text-sm text-muted-foreground">Not found</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground block">Product</span><span className="font-semibold">{pb.product_name}</span></div>
        <div><span className="text-muted-foreground block">Code</span><span className="font-mono">{pb.product_code}</span></div>
        <div><span className="text-muted-foreground block">Formula</span><span className="font-mono">{pb.formula_code}</span></div>
        <div><span className="text-muted-foreground block">Revision</span><span className="font-mono font-semibold">{pb.formula_revision}</span></div>
      </div>
      <h4 className="text-xs font-semibold mt-4 mb-2">Approved Ingredient List (from formula)</h4>
      <table className="w-full text-[12px]">
        <thead><tr className="bg-secondary/50 border-b border-border">
          {["Material", "Code", "Qty Used", "Type"].map(h => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
        </tr></thead>
        <tbody>
          {[...pb.rm_consumption, ...pb.pm_consumption].map((inp, i) => (
            <tr key={i} className="border-b border-border">
              <td className="px-2 py-1.5 font-medium">{inp.material_name}</td>
              <td className="px-2 py-1.5 font-mono text-xs text-accent">{inp.material_code}</td>
              <td className="px-2 py-1.5 tabular-nums">{inp.quantity_used} {inp.unit}</td>
              <td className="px-2 py-1.5"><StatusBadge status={inp.material_code.startsWith("PM") ? "blue" : "green"} label={inp.material_code.startsWith("PM") ? "PM" : "RM"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ─── Main Component ───
export default function BatchTracking() {
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string | null>("B-2026-0412");
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [grnSearchResult, setGrnSearchResult] = useState<string | null>(null);

  const completeness = useMemo(calcCompleteness, []);
  const selectedPB = selectedBatch ? getProductionBatch(selectedBatch) : null;

  // Handle search
  const handleSearch = (val: string) => {
    setSearch(val);
    if (val.toUpperCase().startsWith("GRN-") && val.length >= 8) {
      const grn = getGRN(val.toUpperCase());
      if (grn) { setGrnSearchResult(grn.grn_number); setSelectedBatch(null); return; }
    }
    setGrnSearchResult(null);
    // Try to match batch
    const match = productionBatches.find(b => b.batch_number.toLowerCase().includes(val.toLowerCase()) || b.product_name.toLowerCase().includes(val.toLowerCase()));
    if (match) setSelectedBatch(match.batch_number);
  };

  const filteredBatches = useMemo(() => {
    if (!search) return productionBatches;
    const s = search.toLowerCase();
    return productionBatches.filter(b => b.batch_number.toLowerCase().includes(s) || b.product_name.toLowerCase().includes(s) || b.warehouse.toLowerCase().includes(s));
  }, [search]);

  const toggleInput = (key: string) => setExpandedInputs(prev => ({ ...prev, [key]: !prev[key] }));

  // Build backward trace for selected batch
  const backwardTrace = useMemo(() => {
    if (!selectedPB) return [];
    return [...selectedPB.rm_consumption, ...selectedPB.pm_consumption].map(inp => {
      const rm = getRMBatch(inp.rm_batch_number);
      const grn = rm ? getGRN(rm.grn_number) : null;
      const grnLine = grn?.line_items.find(li => li.rm_batch_number === inp.rm_batch_number);
      const po = rm ? getPO(rm.po_number) : null;
      const vendor = rm ? getVendor(rm.vendor_id) : null;
      const isNonASL = vendor && !vendor.asl;
      const isSuspect = rm && (rm.qc_status === "Quarantine" || rm.qc_status === "Rejected");
      return { inp, rm, grn, grnLine, po, vendor, isNonASL, isSuspect };
    });
  }, [selectedPB]);

  // Forward trace
  const forwardTrace = useMemo(() => {
    if (!selectedPB) return [];
    return getSOsByBatch(selectedPB.batch_number);
  }, [selectedPB]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Batch & Serial Tracking</h2>
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search batch, material, or GRN-xxxx..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-card text-sm" />
        </div>
      </div>

      {/* Completeness Indicators */}
      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><Shield className="w-5 h-5 text-success" /></div>
          <div><div className="text-xs text-muted-foreground">Backward Trace Complete</div><div className="text-xl font-bold tabular-nums text-success">{completeness.backwardPct}%</div></div>
        </div>
        <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center"><Package className="w-5 h-5 text-accent" /></div>
          <div><div className="text-xs text-muted-foreground">Forward Trace Complete</div><div className="text-xl font-bold tabular-nums text-accent">{completeness.forwardPct}%</div></div>
        </div>
        <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${completeness.containmentActions > 0 ? "bg-danger/10" : "bg-success/10"}`}>
            <AlertTriangle className={`w-5 h-5 ${completeness.containmentActions > 0 ? "text-danger" : "text-success"}`} />
          </div>
          <div><div className="text-xs text-muted-foreground">Open Containment Actions</div><div className={`text-xl font-bold tabular-nums ${completeness.containmentActions > 0 ? "text-danger" : "text-success"}`}>{completeness.containmentActions}</div></div>
        </div>
      </div>

      {/* GRN Search Result */}
      {grnSearchResult && <GRNSearchResult grnNumber={grnSearchResult} onClose={() => { setGrnSearchResult(null); setSearch(""); }} />}

      {/* Traceability Panel */}
      {selectedPB && !grnSearchResult && (
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Traceability: <button onClick={() => setDrawer({ kind: "product", batchNumber: selectedPB.batch_number })} className="text-accent underline">{selectedPB.batch_number}</button>
              <span className="text-muted-foreground font-normal ml-2">— {selectedPB.product_name} — {selectedPB.formula_code} {selectedPB.formula_revision}</span>
            </h3>
            <div className="flex items-center gap-2">
              {(selectedPB.qc_status === "Quarantine" || selectedPB.qc_status === "Failed") && (
                <button onClick={() => setDrawer({ kind: "containment", batchNumber: selectedPB.batch_number })} className="h-7 px-2.5 bg-danger text-danger-foreground rounded text-xs font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Containment
                </button>
              )}
              <button onClick={() => setDrawer({ kind: "qc", batchNumber: selectedPB.batch_number })} className="h-7 px-2.5 bg-accent text-accent-foreground rounded text-xs font-medium">QC Report</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Backward Trace */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">← Backward Trace ({backwardTrace.length} inputs)</h4>
              <div className="space-y-1.5">
                {backwardTrace.map(({ inp, rm, grn, grnLine, po, vendor, isNonASL, isSuspect }) => (
                  <div key={inp.rm_batch_number} className={`rounded-md border text-xs ${isSuspect ? "border-danger/30 bg-danger/5" : isNonASL ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer" onClick={() => toggleInput(inp.rm_batch_number)}>
                      {expandedInputs[inp.rm_batch_number] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                      <StatusBadge status={inp.material_code.startsWith("PM") ? "blue" : "green"} label={inp.material_code.startsWith("PM") ? "PM" : "RM"} />
                      <button onClick={e => { e.stopPropagation(); if (rm) setDrawer({ kind: "grn", grnNumber: rm.grn_number }); }} className="font-mono text-accent hover:underline">{inp.rm_batch_number}</button>
                      <span className="font-medium truncate">{inp.material_name}</span>
                      <span className="tabular-nums text-muted-foreground ml-auto">{inp.quantity_used} {inp.unit}</span>
                      {isSuspect && <AlertTriangle className="w-3 h-3 text-danger" />}
                      {isNonASL && <AlertTriangle className="w-3 h-3 text-warning" />}
                    </div>
                    {expandedInputs[inp.rm_batch_number] && rm && (
                      <div className="px-2.5 pb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] border-t border-border/50 pt-1.5 ml-5">
                        <div><span className="text-muted-foreground">Supplier</span> <button onClick={() => setDrawer({ kind: "vendor", vendorId: rm.vendor_id, grnNumber: rm.grn_number })} className="text-accent hover:underline">{rm.vendor_name}</button></div>
                        <div><span className="text-muted-foreground">GRN</span> <button onClick={() => setDrawer({ kind: "grn", grnNumber: rm.grn_number })} className="text-accent hover:underline">{rm.grn_number}</button></div>
                        <div><span className="text-muted-foreground">Supplier Lot</span> <span className="font-mono">{rm.supplier_lot_number}</span></div>
                        <div><span className="text-muted-foreground">CoA</span> <span>{rm.coa_reference}</span></div>
                        <div><span className="text-muted-foreground">PO</span> <span className="font-mono">{rm.po_number}</span></div>
                        <div><span className="text-muted-foreground">QC</span> <StatusBadge status={rm.qc_status === "Approved" ? "green" : rm.qc_status === "Quarantine" ? "amber" : "red"} label={rm.qc_status} /></div>
                        <div><span className="text-muted-foreground">Location</span> <span>{rm.storage_location} / {rm.bin}</span></div>
                        {isNonASL && <div className="col-span-2 text-warning font-semibold">⚠ Supplier not on ASL for {inp.material_code}</div>}
                        {isSuspect && <div className="col-span-2 text-danger font-semibold">⚠ RM batch QC: {rm.qc_status} — suspect material</div>}
                      </div>
                    )}
                  </div>
                ))}
                {/* QC Lot */}
                <div className="px-2.5 py-1.5 rounded-md border border-border text-xs flex items-center gap-2">
                  <span className="text-success">✅</span>
                  <span>QC Lot:</span>
                  <button onClick={() => setDrawer({ kind: "qc", batchNumber: selectedPB.batch_number })} className="font-mono text-accent hover:underline">{selectedPB.qc_lot_number}</button>
                  <span className="text-muted-foreground">— {selectedPB.qc_result.filter(r => r.status === "Pass").length}/{selectedPB.qc_result.length} parameters passed — {fmtDate(selectedPB.qc_date)}</span>
                </div>
              </div>
            </div>

            {/* Forward Trace */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Forward Trace → ({forwardTrace.length} orders)</h4>
              <div className="space-y-1.5">
                {forwardTrace.map(so => {
                  const lines = so.line_items.filter(li => li.batch_number === selectedPB.batch_number);
                  const totalQty = lines.reduce((s, li) => s + li.quantity, 0);
                  return (
                    <div key={so.so_number} className="px-2.5 py-1.5 rounded-md border border-border text-xs flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">📤</span>
                      <button onClick={() => setDrawer({ kind: "so", soNumber: so.so_number })} className="font-mono text-accent hover:underline">{so.so_number}</button>
                      <span className="font-medium">{so.customer_name}</span>
                      <span className="tabular-nums">{totalQty.toLocaleString()} units</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{so.invoice_number}</span>
                      <StatusBadge status={so.delivery_status === "delivered" ? "green" : so.delivery_status === "in_transit" ? "amber" : "gray"} label={so.delivery_status === "delivered" ? "Delivered" : so.delivery_status === "in_transit" ? "In Transit" : "Pending"} />
                      {so.dispatch_date && <span className="text-muted-foreground">{fmtDate(so.dispatch_date)}</span>}
                    </div>
                  );
                })}
                {/* Remaining stock */}
                <div className="px-2.5 py-1.5 rounded-md border border-border bg-secondary/20 text-xs flex items-center gap-2">
                  <span>📍</span>
                  <span>Remaining: <strong className="tabular-nums">{selectedPB.quantity_remaining.toLocaleString()} {selectedPB.unit}</strong> in {selectedPB.warehouse} ({selectedPB.bin})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Batch Register Table */}
        <div className="col-span-2 bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-secondary/50 border-b border-border">
                {["Batch", "Material", "Qty", "Mfg Date", "Expiry", "Warehouse", "Bin", "Formula Rev", "Inputs", "QC", "Age"].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                )}
              </tr></thead>
              <tbody>
                {filteredBatches.map(b => {
                  const age = daysBetween(b.production_date, today);
                  const inputCount = b.rm_consumption.length + b.pm_consumption.length;
                  const isContainment = b.qc_status === "Quarantine" || b.qc_status === "Failed";
                  return (
                    <tr key={b.batch_number} className={`border-b border-border hover:bg-secondary/30 cursor-pointer ${selectedBatch === b.batch_number ? "bg-accent/5" : ""} ${isContainment ? "bg-danger/3" : ""}`}
                      onClick={() => { setSelectedBatch(b.batch_number); setGrnSearchResult(null); }}>
                      <td className="px-3 py-2 font-mono text-xs text-accent">{b.batch_number}</td>
                      <td className="px-3 py-2 font-medium">
                        <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "product", batchNumber: b.batch_number }); }} className="hover:underline text-left">{b.product_name}</button>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{b.quantity_produced.toLocaleString()} {b.unit}</td>
                      <td className="px-3 py-2">{fmtDate(b.production_date)}</td>
                      <td className="px-3 py-2">{fmtDate(b.expiry_date)}</td>
                      <td className="px-3 py-2">{b.warehouse}</td>
                      <td className="px-3 py-2 font-mono text-xs">{b.bin}</td>
                      <td className="px-3 py-2 font-mono text-xs">{b.formula_revision}</td>
                      <td className="px-3 py-2">
                        <button onClick={e => { e.stopPropagation(); setSelectedBatch(b.batch_number); setGrnSearchResult(null); }}
                          className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[11px] font-semibold hover:bg-accent/20">{inputCount} inputs</button>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "qc", batchNumber: b.batch_number }); }}>
                          <StatusBadge status={b.qc_status === "Approved" ? "green" : b.qc_status === "Quarantine" ? "amber" : "red"} label={b.qc_status} />
                        </button>
                        {isContainment && (
                          <button onClick={e => { e.stopPropagation(); setDrawer({ kind: "containment", batchNumber: b.batch_number }); }}
                            className="ml-1 text-danger"><AlertTriangle className="w-3 h-3 inline" /></button>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{age}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expiring Batches */}
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-4">
          <h3 className="text-sm font-semibold mb-3 text-danger">Expiring Within 30 Days</h3>
          <div className="space-y-3">
            {expiringBatches.length > 0 ? expiringBatches.map(b => {
              const daysLeft = daysBetween(today, b.expiry_date);
              const value = b.quantity_remaining * 300; // approx
              return (
                <div key={b.batch_number} className="p-2.5 rounded-md bg-danger/5 border border-danger/10 cursor-pointer" onClick={() => { setSelectedBatch(b.batch_number); setGrnSearchResult(null); }}>
                  <div className="text-xs font-mono text-accent">{b.batch_number}</div>
                  <div className="text-sm font-medium">{b.product_name}</div>
                  <div className="text-xs text-muted-foreground">{b.quantity_remaining} {b.unit} · Expires {fmtDate(b.expiry_date)} · {daysLeft}d left · ~₹{(value / 100000).toFixed(2)}L</div>
                </div>
              );
            }) : <div className="text-xs text-muted-foreground py-4 text-center">No batches expiring within 30 days</div>}
          </div>
        </div>
      </div>

      {/* Side Drawer */}
      {drawer && <SideDrawer drawer={drawer} onClose={() => setDrawer(null)} onNavigate={setDrawer} />}
    </div>
  );
}
