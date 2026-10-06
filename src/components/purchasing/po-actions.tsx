"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnDestructive, btnPrimary, btnSecondary, btnGhostSm, inputSm, selectSm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiGetWithMeta, apiSend } from "@/lib/api";
import { ErrorNote, newIdempotencyKey } from "@/components/app/api-error-note";
import { SearchPicker } from "@/components/app/search-picker";
import { formatQty } from "@/lib/format";
import type { PurchaseOrderDetail } from "@/server/purchasing/purchase-orders";

/**
 * Purchase order actions: raise, approve, send, receive, cancel, delete.
 *
 * Buttons appear only when the user holds the permission and the PO's status
 * allows the step; the server enforces both again on every request, so this
 * decides what is offered, not what is allowed.
 */

function useRefreshPurchasing() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    if (id) void qc.invalidateQueries({ queryKey: ["purchase-order", id] });
    // Receipts change stock, lots and incoming supply everywhere they are
    // shown: every ["inventory", …] query, and BOM component supply.
    void qc.invalidateQueries({ queryKey: ["inventory"] });
    void qc.invalidateQueries({ queryKey: ["bom-component"] });
  };
}

const label = "block text-caption text-muted-foreground mb-1";
const today = () => new Date().toISOString().slice(0, 10);

/* ---- New purchase order ----------------------------------------------------- */

interface VendorOption { id: string; code: string; name: string; isApproved: boolean }
interface LocationOption { id: string; code: string; name: string }
interface MaterialOption { id: string; code: string; name: string; unit: { code: string }; kind: string }

interface DraftLine { material: MaterialOption | null; orderedQty: string; unitPrice: string }

/** What a PO can buy: anything but finished goods. */
const ORDERABLE_KINDS = { kinds: "RAW,PACKAGING,SEMI_FINISHED,CONSUMABLE" };
const formatMaterial = (m: MaterialOption) => `${m.code} — ${m.name} (${m.unit.code})`;
const formatVendor = (v: VendorOption) => `${v.code} — ${v.name}${v.isApproved ? "" : " (not on ASL)"}`;

export function NewPurchaseOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("purchase-order:create")) return null;
  return (
    <>
      <button className={btnPrimary} onClick={() => setOpen(true)}>New purchase order</button>
      {open && <NewPurchaseOrderDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewPurchaseOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const refresh = useRefreshPurchasing();
  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: () => apiGet<LocationOption[]>("/locations") });

  const [vendor, setVendor] = useState<VendorOption | null>(null);
  const [locationId, setLocationId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ material: null, orderedQty: "", unitPrice: "" }]);

  const create = useMutation({
    mutationFn: () => apiSend<{ id: string; orderNumber: string }>("POST", "/purchase-orders", {
      vendorId: vendor?.id, locationId, expectedDeliveryDate: expected, notes: notes || undefined,
      lines: lines.filter((l) => l.material).map((l) => ({
        materialId: l.material!.id,
        orderedQty: Number(l.orderedQty),
        // Blank → the vendor's price on file.
        unitPrice: l.unitPrice === "" ? undefined : Number(l.unitPrice),
      })),
    }),
    onSuccess: (po) => {
      toast.success(`${po.orderNumber} raised as a draft`);
      refresh(po.id);
      onCreated(po.id);
      onClose();
    },
  });

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = vendor && locationId && expected && lines.some((l) => l.material && Number(l.orderedQty) > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>Saved as a draft. Leave a price blank to use the vendor&apos;s price on file.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><span className={label}>Vendor</span>
            <SearchPicker<VendorOption> endpoint="/vendors" label="Vendor" value={vendor} onChange={setVendor} format={formatVendor} />
          </div>
          <label><span className={label}>Deliver to</span>
            <select className={selectSm} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose…</option>
              {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label><span className={label}>Expected delivery</span>
            <input type="date" className={inputSm} min={today()} value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
        </div>

        <div className="space-y-2">
          <span className={label}>Lines</span>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_auto] gap-2 items-center">
              <SearchPicker<MaterialOption> endpoint="/materials" params={ORDERABLE_KINDS} label={`Line ${i + 1} material`}
                value={l.material} onChange={(m) => setLine(i, { material: m })} format={formatMaterial} />
              <input className={inputSm} inputMode="decimal" placeholder="Qty" aria-label={`Line ${i + 1} quantity`}
                value={l.orderedQty} onChange={(e) => setLine(i, { orderedQty: e.target.value })} />
              <input className={inputSm} inputMode="decimal" placeholder="Price (₹)" aria-label={`Line ${i + 1} unit price`}
                value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <button className={btnGhostSm} aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className={btnGhostSm} onClick={() => setLines((ls) => [...ls, { material: null, orderedQty: "", unitPrice: "" }])}>
            Add line
          </button>
        </div>

        <label><span className={label}>Notes</span>
          <textarea className={`${inputSm} h-16 rounded-lg py-1.5`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>

        <ErrorNote error={create.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save draft"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Status actions on one PO ------------------------------------------- */

export function PurchaseOrderActions({ po, onDeleted }: { po: PurchaseOrderDetail; onDeleted: () => void }) {
  const { can } = useSession();
  const refresh = useRefreshPurchasing();
  const [dialog, setDialog] = useState<null | "receive" | "cancel">(null);

  const step = useMutation({
    mutationFn: ({ path, method = "POST" }: { path: string; method?: "POST" | "DELETE" }) =>
      apiSend(method, `/purchase-orders/${po.id}${path}`),
    onSuccess: (_d, v) => {
      refresh(po.id);
      if (v.method === "DELETE") {
        toast.success(`${po.orderNumber} deleted`);
        onDeleted();
      } else {
        toast.success(v.path === "/approve" ? `${po.orderNumber} approved` : `${po.orderNumber} marked as sent to the vendor`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const s = po.status;
  const receivable = ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(s);
  const actions = [
    s === "DRAFT" && can("purchase-order:approve") && (
      <button key="approve" className={btnPrimary} disabled={step.isPending} onClick={() => step.mutate({ path: "/approve" })}>Approve</button>
    ),
    s === "APPROVED" && can("purchase-order:update") && (
      <button key="send" className={btnSecondary} disabled={step.isPending} onClick={() => step.mutate({ path: "/send" })}>Mark sent to vendor</button>
    ),
    receivable && can("goods-receipt:create") && (
      <button key="receive" className={btnPrimary} onClick={() => setDialog("receive")}>Receive goods</button>
    ),
    ["DRAFT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(s) && can("purchase-order:update") && (
      <button key="cancel" className={btnDestructive} onClick={() => setDialog("cancel")}>
        {s === "PARTIALLY_RECEIVED" ? "Cancel remainder" : "Cancel PO"}
      </button>
    ),
    s === "DRAFT" && can("purchase-order:delete") && (
      <button key="delete" className={btnDestructive} disabled={step.isPending}
        onClick={() => step.mutate({ path: "", method: "DELETE" })}>Delete draft</button>
    ),
  ].filter(Boolean);

  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions}
      {dialog === "receive" && <ReceiveGoodsDialog po={po} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelPurchaseOrderDialog po={po} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CancelPurchaseOrderDialog({ po, onClose }: { po: PurchaseOrderDetail; onClose: () => void }) {
  const refresh = useRefreshPurchasing();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => apiSend("POST", `/purchase-orders/${po.id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success(`${po.orderNumber} cancelled`);
      refresh(po.id);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {po.orderNumber}</DialogTitle>
          <DialogDescription>
            {po.status === "PARTIALLY_RECEIVED"
              ? "What has arrived stays received; the outstanding quantity stops counting as incoming supply."
              : "The order stops counting as incoming supply. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <label><span className={label}>Reason (recorded on the order and the audit trail)</span>
          <textarea className={`${inputSm} h-20 rounded-lg py-1.5`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        <ErrorNote error={cancel.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Keep order</button>
          <button className={btnDestructive} disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending ? "Cancelling…" : "Cancel order"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Goods receipt ---------------------------------------------------------- */

interface ReceiptDraft {
  receive: boolean;
  receivedQty: string;
  rejectedQty: string;
  supplierLotNumber: string;
  coaReference: string;
  inspectionStatus: "PENDING" | "APPROVED" | "QUARANTINE";
}

const fmtDueDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface ReceiptResult { grnNumber: string; lines: { lot: { lotNumber: string } | null }[] }

function ReceiveGoodsDialog({ po, onClose }: { po: PurchaseOrderDetail; onClose: () => void }) {
  const refresh = useRefreshPurchasing();
  // One key per opening of the form: a double click, or a retry after a
  // network failure, posts the receipt once.
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const open = po.lines.filter((l) => l.outstandingQty > 0);
  const [draft, setDraft] = useState<Record<string, ReceiptDraft>>(() =>
    Object.fromEntries(open.map((l) => [l.id, {
      receive: true, receivedQty: String(l.outstandingQty), rejectedQty: "", supplierLotNumber: "", coaReference: "",
      inspectionStatus: l.material.isBatchTracked ? "PENDING" : "APPROVED",
    }])),
  );
  const [notes, setNotes] = useState("");
  const set = (id: string, patch: Partial<ReceiptDraft>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const post = useMutation({
    mutationFn: () => apiSend<ReceiptResult>("POST", "/goods-receipts", {
      purchaseOrderId: po.id,
      notes: notes || undefined,
      lines: open.filter((l) => draft[l.id].receive).map((l) => {
        const d = draft[l.id];
        return {
          purchaseOrderLineId: l.id,
          receivedQty: Number(d.receivedQty || 0),
          rejectedQty: d.rejectedQty ? Number(d.rejectedQty) : undefined,
          supplierLotNumber: d.supplierLotNumber || undefined,
          coaReference: d.coaReference || undefined,
          inspectionStatus: d.inspectionStatus,
        };
      }),
    }, { idempotencyKey }),
    onSuccess: (r) => {
      const lots = r.lines.filter((l) => l.lot).map((l) => l.lot!.lotNumber);
      toast.success(`${r.grnNumber} posted${lots.length ? ` · lot${lots.length > 1 ? "s" : ""} ${lots.join(", ")}` : ""}`);
      refresh(po.id);
      onClose();
    },
  });

  const any = open.some((l) => draft[l.id].receive && (Number(draft[l.id].receivedQty) > 0 || Number(draft[l.id].rejectedQty) > 0));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Receive goods — {po.orderNumber}</DialogTitle>
          <DialogDescription>
            Accepted quantity goes into stock at {po.location.name}. Rejected quantity is recorded and returned, not stocked.
            Batch-tracked materials get a new lot, held until quality releases it unless you receive it as approved.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="data-table w-full text-body-sm">
            <thead><tr className="border-b border-border">
              {["", "Material", "Due", "Outstanding", "Accept", "Reject", "Supplier lot", "CoA ref", "Inspection"].map((h) =>
                <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {open.map((l) => {
                const d = draft[l.id];
                return (
                  <tr key={l.id} className="border-b border-border align-middle">
                    <td className="px-2 py-1.5">
                      <input type="checkbox" aria-label={`Receive line ${l.lineNumber}`} checked={d.receive} onChange={(e) => set(l.id, { receive: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1.5"><span className="identifier text-muted-foreground">{l.material.code}</span> {l.material.name}</td>
                    {/* A material may be on the order more than once, due on different dates. */}
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{fmtDueDate(l.expectedDeliveryDate)}</td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.outstandingQty)} {l.uom}</td>
                    <td className="px-2 py-1.5 w-[100px]">
                      <input className={inputSm} inputMode="decimal" aria-label={`Accepted quantity line ${l.lineNumber}`} disabled={!d.receive}
                        value={d.receivedQty} onChange={(e) => set(l.id, { receivedQty: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 w-[90px]">
                      <input className={inputSm} inputMode="decimal" aria-label={`Rejected quantity line ${l.lineNumber}`} disabled={!d.receive}
                        value={d.rejectedQty} onChange={(e) => set(l.id, { rejectedQty: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 w-[130px]">
                      <input className={inputSm} aria-label={`Supplier lot line ${l.lineNumber}`} disabled={!d.receive || !l.material.isBatchTracked}
                        value={d.supplierLotNumber} onChange={(e) => set(l.id, { supplierLotNumber: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 w-[120px]">
                      <input className={inputSm} aria-label={`CoA reference line ${l.lineNumber}`} disabled={!d.receive}
                        value={d.coaReference} onChange={(e) => set(l.id, { coaReference: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 w-[140px]">
                      <select className={selectSm} aria-label={`Inspection line ${l.lineNumber}`} disabled={!d.receive || !l.material.isBatchTracked}
                        value={d.inspectionStatus} onChange={(e) => set(l.id, { inspectionStatus: e.target.value as ReceiptDraft["inspectionStatus"] })}>
                        <option value="PENDING">Pending QC</option>
                        <option value="APPROVED">Approved</option>
                        <option value="QUARANTINE">Quarantine</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <label><span className={label}>Notes</span>
          <input className={inputSm} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>

        <ErrorNote error={post.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Close</button>
          <button className={btnPrimary} disabled={!any || post.isPending} onClick={() => post.mutate()}>
            {post.isPending ? "Posting…" : "Post receipt"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
