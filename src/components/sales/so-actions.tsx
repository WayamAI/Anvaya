"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnDestructive, btnGhostSm, btnPrimary, btnSecondary, inputSm, selectSm } from "@/components/app/controls";
import { ErrorNote, newIdempotencyKey } from "@/components/app/api-error-note";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiGetWithMeta, apiSend } from "@/lib/api";
import { formatQty } from "@/lib/format";
import type { SalesOrderDetail } from "@/server/sales/sales-orders";

/**
 * Sales order actions: book, dispatch, mark delivered, cancel.
 *
 * Offered by permission and status; the server enforces both again.
 * Dispatch of batch-tracked lines draws released lots first-expiry-first-out
 * on the server, so the form asks only how much to ship.
 */

const label = "block text-caption text-muted-foreground mb-1";
const today = () => new Date().toISOString().slice(0, 10);

function useRefreshSales() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["sales-orders"] });
    if (id) void qc.invalidateQueries({ queryKey: ["sales-order", id] });
    void qc.invalidateQueries({ queryKey: ["inventory"] });
  };
}

/* ---- Book an order ------------------------------------------------------------ */

interface Option { id: string; code: string; name: string }
interface MaterialOption extends Option { unit: { code: string }; kind: string }
interface DraftLine { materialId: string; quantity: string; unitPrice: string }

export function NewSalesOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("sales-order:create")) return null;
  return (
    <>
      <button className={btnPrimary} onClick={() => setOpen(true)}>New sales order</button>
      {open && <NewSalesOrderDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewSalesOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const refresh = useRefreshSales();
  const customers = useQuery({ queryKey: ["customers", "active"], queryFn: () => apiGet<Option[]>("/customers") });
  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: () => apiGet<Option[]>("/locations") });
  const materials = useQuery({
    queryKey: ["materials", "sellable"],
    queryFn: async () => (await apiGetWithMeta<MaterialOption[]>("/materials", { limit: 200 })).data
      .filter((m) => m.kind === "FINISHED" || m.kind === "SEMI_FINISHED"),
  });

  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ materialId: "", quantity: "", unitPrice: "" }]);
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const create = useMutation({
    mutationFn: () => apiSend<{ id: string; orderNumber: string }>("POST", "/sales-orders", {
      customerId, locationId, requiredDate, notes: notes || undefined,
      lines: lines.filter((l) => l.materialId).map((l) => ({
        materialId: l.materialId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
      })),
    }),
    onSuccess: (so) => {
      toast.success(`${so.orderNumber} booked`);
      refresh(so.id);
      onCreated(so.id);
      onClose();
    },
  });

  const ready = customerId && locationId && requiredDate &&
    lines.some((l) => l.materialId && Number(l.quantity) > 0 && l.unitPrice !== "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New sales order</DialogTitle>
          <DialogDescription>Booked as confirmed. Every line ships from the chosen location.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label><span className={label}>Customer</span>
            <select className={selectSm} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Choose…</option>
              {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label><span className={label}>Ship from</span>
            <select className={selectSm} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose…</option>
              {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label><span className={label}>Required by</span>
            <input type="date" className={inputSm} min={today()} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2">
          <span className={label}>Lines</span>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_auto] gap-2 items-center">
              <select className={selectSm} aria-label={`Line ${i + 1} product`} value={l.materialId} onChange={(e) => setLine(i, { materialId: e.target.value })}>
                <option value="">Product…</option>
                {materials.data?.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.unit.code})</option>)}
              </select>
              <input className={inputSm} inputMode="decimal" placeholder="Qty" aria-label={`Line ${i + 1} quantity`}
                value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input className={inputSm} inputMode="decimal" placeholder="Price (₹)" aria-label={`Line ${i + 1} unit price`}
                value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <button className={btnGhostSm} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className={btnGhostSm} onClick={() => setLines((ls) => [...ls, { materialId: "", quantity: "", unitPrice: "" }])}>Add line</button>
        </div>
        <label><span className={label}>Notes</span>
          <textarea className={`${inputSm} h-16 rounded-lg py-1.5`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>
        <ErrorNote error={create.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Booking…" : "Book order"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Actions on one order ----------------------------------------------------- */

export function SalesOrderActions({ so }: { so: SalesOrderDetail }) {
  const { can } = useSession();
  const refresh = useRefreshSales();
  const [dialog, setDialog] = useState<null | "dispatch" | "cancel">(null);

  const deliver = useMutation({
    mutationFn: () => apiSend("POST", `/sales-orders/${so.id}/deliver`, {}),
    onSuccess: () => { toast.success(`${so.orderNumber} delivered`); refresh(so.id); },
    onError: (e) => toast.error((e as Error).message),
  });

  const open = so.status === "CONFIRMED" || so.status === "PROCESSING";
  const actions = [
    open && can("sales-order:dispatch") && <button key="d" className={btnPrimary} onClick={() => setDialog("dispatch")}>Dispatch</button>,
    so.status === "DISPATCHED" && can("sales-order:dispatch") && (
      <button key="del" className={btnSecondary} disabled={deliver.isPending} onClick={() => deliver.mutate()}>Mark delivered</button>
    ),
    open && can("sales-order:update") && (
      <button key="c" className={btnDestructive} onClick={() => setDialog("cancel")}>
        {so.status === "PROCESSING" ? "Cancel remainder" : "Cancel order"}
      </button>
    ),
  ].filter(Boolean);
  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions}
      {dialog === "dispatch" && <DispatchDialog so={so} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelSalesOrderDialog so={so} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CancelSalesOrderDialog({ so, onClose }: { so: SalesOrderDetail; onClose: () => void }) {
  const refresh = useRefreshSales();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => apiSend("POST", `/sales-orders/${so.id}/cancel`, { reason }),
    onSuccess: () => { toast.success(`${so.orderNumber} cancelled`); refresh(so.id); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {so.orderNumber}</DialogTitle>
          <DialogDescription>
            {so.status === "PROCESSING" ? "What has shipped stays shipped; the open quantity is cancelled." : "The order stops counting as demand. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <label><span className={label}>Reason</span>
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

interface DispatchResult { lines: { materialCode: string; lots: { lotNumber: string; quantity: number }[] }[]; salesOrder: { status: string } }

function DispatchDialog({ so, onClose }: { so: SalesOrderDetail; onClose: () => void }) {
  const refresh = useRefreshSales();
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const open = so.lines.filter((l) => l.openQty > 0);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.id, String(
    // Default to what can actually go: the open quantity, capped at available stock.
    Math.max(0, Math.min(l.openQty, l.stock?.available ?? 0)),
  )])));
  const [invoiceNumber, setInvoiceNumber] = useState(so.invoiceNumber ?? "");

  const post = useMutation({
    mutationFn: () => apiSend<DispatchResult>("POST", `/sales-orders/${so.id}/dispatches`, {
      invoiceNumber: invoiceNumber || undefined,
      lines: open.filter((l) => Number(qty[l.id]) > 0).map((l) => ({ salesOrderLineId: l.id, quantity: Number(qty[l.id]) })),
    }, { idempotencyKey }),
    onSuccess: (r) => {
      const lots = r.lines.flatMap((l) => l.lots.map((x) => x.lotNumber));
      toast.success(`${so.orderNumber} ${r.salesOrder.status === "DISPATCHED" ? "fully dispatched" : "partly dispatched"}${lots.length ? ` · lots ${lots.join(", ")}` : ""}`);
      refresh(so.id);
      onClose();
    },
  });

  const any = open.some((l) => Number(qty[l.id]) > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dispatch — {so.orderNumber}</DialogTitle>
          <DialogDescription>
            Batch-tracked products ship from released lots, soonest expiry first. Held or expired lots are never shipped.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-body-sm">
            <thead><tr className="border-b border-border">
              {["Product", "From", "Open", "Available", "Ship now"].map((h) =>
                <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {open.map((l) => (
                <tr key={l.id} className="border-b border-border">
                  <td className="px-2 py-1.5"><span className="identifier text-muted-foreground">{l.material.code}</span> {l.material.name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{l.location.name}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.openQty)} {l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.stock ? `${formatQty(l.stock.available)} ${l.uom}` : "—"}</td>
                  <td className="px-2 py-1.5 w-[110px]">
                    <input className={inputSm} inputMode="decimal" aria-label={`Ship quantity line ${l.lineNumber}`}
                      value={qty[l.id]} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label><span className={label}>Invoice number</span>
          <input className={inputSm} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={50} />
        </label>
        <ErrorNote error={post.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Close</button>
          <button className={btnPrimary} disabled={!any || post.isPending} onClick={() => post.mutate()}>
            {post.isPending ? "Posting…" : "Post dispatch"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
