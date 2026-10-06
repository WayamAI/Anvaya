"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnDestructive, btnPrimary, btnSecondary, inputSm, selectSm } from "@/components/app/controls";
import { ErrorNote, newIdempotencyKey } from "@/components/app/api-error-note";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiSend } from "@/lib/api";
import { formatQty } from "@/lib/format";
import type { WorkOrderDetail } from "@/server/production/work-orders";
import type { BomProduct } from "@/server/production/bom";

/**
 * Work order actions: plan, firm, release, issue materials, report output,
 * complete, close, cancel. Offered by permission and status; the server
 * enforces both.
 */

const label = "block text-caption text-muted-foreground mb-1";
const today = () => new Date().toISOString().slice(0, 10);

function useRefreshProduction() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["work-orders"] });
    if (id) void qc.invalidateQueries({ queryKey: ["work-order", id] });
    void qc.invalidateQueries({ queryKey: ["production-schedule"] });
    void qc.invalidateQueries({ queryKey: ["inventory"] });
  };
}

/* ---- Plan ------------------------------------------------------------------ */

interface LocationOption { id: string; name: string; isManufacturing: boolean }

export function NewWorkOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("work-order:create")) return null;
  return (
    <>
      <button className={btnPrimary} onClick={() => setOpen(true)}>New work order</button>
      {open && <NewWorkOrderDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewWorkOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const refresh = useRefreshProduction();
  const products = useQuery({ queryKey: ["boms"], queryFn: () => apiGet<BomProduct[]>("/boms") });
  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: () => apiGet<LocationOption[]>("/locations") });
  const [materialId, setMaterialId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());

  const create = useMutation({
    mutationFn: () => apiSend<{ id: string; orderNumber: string }>("POST", "/work-orders", {
      materialId, locationId, plannedQty: Number(plannedQty), plannedStartDate: start, plannedEndDate: end,
    }),
    onSuccess: (wo) => { toast.success(`${wo.orderNumber} planned`); refresh(wo.id); onCreated(wo.id); onClose(); },
  });

  const makeable = products.data?.filter((p) => p.bom?.activeVersion) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New work order</DialogTitle>
          <DialogDescription>Components are taken from the product&apos;s active BOM version.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2"><span className={label}>Product</span>
            <select className={selectSm} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">Choose…</option>
              {makeable.map((p) => <option key={p.materialId} value={p.materialId}>{p.code} — {p.name} (BOM {p.bom!.code} rev {p.bom!.activeVersion})</option>)}
            </select>
          </label>
          <label><span className={label}>Plant</span>
            <select className={selectSm} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose…</option>
              {locations.data?.filter((l) => l.isManufacturing).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label><span className={label}>Quantity</span>
            <input className={inputSm} inputMode="decimal" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} />
          </label>
          <label><span className={label}>Planned start</span>
            <input type="date" className={inputSm} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label><span className={label}>Planned end</span>
            <input type="date" className={inputSm} min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <ErrorNote error={create.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!materialId || !locationId || !(Number(plannedQty) > 0) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Planning…" : "Plan order"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Actions on one order --------------------------------------------------- */

type Dialogs = null | "issue" | "output" | "complete" | "cancel";

export function WorkOrderActions({ wo }: { wo: WorkOrderDetail }) {
  const { can } = useSession();
  const refresh = useRefreshProduction();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const step = useMutation({
    mutationFn: (path: "firm" | "release" | "close") => apiSend("POST", `/work-orders/${wo.id}/${path}`),
    onSuccess: (_d, path) => {
      toast.success(`${wo.orderNumber} ${{ firm: "firmed", release: "released", close: "closed" }[path]}`);
      refresh(wo.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!can("work-order:update")) return null;
  const s = wo.status;
  const actions = [
    s === "PLANNED" && <button key="firm" className={btnSecondary} disabled={step.isPending} onClick={() => step.mutate("firm")}>Firm</button>,
    (s === "PLANNED" || s === "FIRMED") && <button key="rel" className={btnPrimary} disabled={step.isPending} onClick={() => step.mutate("release")}>Release</button>,
    (s === "RELEASED" || s === "IN_PROGRESS") && <button key="iss" className={btnPrimary} onClick={() => setDialog("issue")}>Issue materials</button>,
    (s === "RELEASED" || s === "IN_PROGRESS") && <button key="out" className={btnSecondary} onClick={() => setDialog("output")}>Report output</button>,
    s === "IN_PROGRESS" && <button key="comp" className={btnSecondary} onClick={() => setDialog("complete")}>Complete</button>,
    s === "COMPLETED" && <button key="close" className={btnSecondary} disabled={step.isPending} onClick={() => step.mutate("close")}>Close</button>,
    ["PLANNED", "FIRMED", "RELEASED"].includes(s) && <button key="cancel" className={btnDestructive} onClick={() => setDialog("cancel")}>Cancel</button>,
  ].filter(Boolean);
  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions}
      {dialog === "issue" && <IssueDialog wo={wo} onClose={() => setDialog(null)} />}
      {dialog === "output" && <OutputDialog wo={wo} onClose={() => setDialog(null)} />}
      {dialog === "complete" && <CompleteDialog wo={wo} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelDialog wo={wo} onClose={() => setDialog(null)} />}
    </div>
  );
}

function IssueDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const refresh = useRefreshProduction();
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const open = wo.components.filter((c) => c.requiredQty - c.issuedQty > 0);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((c) => [c.material.id, String(Math.round((c.requiredQty - c.issuedQty) * 1e6) / 1e6)])));

  const post = useMutation({
    mutationFn: () => apiSend<{ lines: { materialCode: string; lots: { lotNumber: string }[] }[] }>("POST", `/work-orders/${wo.id}/issues`, {
      lines: open.filter((c) => Number(qty[c.material.id]) > 0).map((c) => ({ materialId: c.material.id, quantity: Number(qty[c.material.id]) })),
    }, { idempotencyKey }),
    onSuccess: (r) => {
      const lots = r.lines.flatMap((l) => l.lots.map((x) => x.lotNumber));
      toast.success(`Materials issued to ${wo.orderNumber}${lots.length ? ` · lots ${lots.join(", ")}` : ""}`);
      refresh(wo.id);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue materials — {wo.orderNumber}</DialogTitle>
          <DialogDescription>Batch-tracked components are drawn from released lots, soonest expiry first.</DialogDescription>
        </DialogHeader>
        <table className="data-table w-full text-body-sm">
          <thead><tr className="border-b border-border">
            {["Component", "Required", "Issued", "On hand", "Issue now"].map((h) => <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {open.map((c) => (
              <tr key={c.material.id} className="border-b border-border">
                <td className="px-2 py-1.5"><span className="identifier text-muted-foreground">{c.material.code}</span> {c.material.name}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatQty(c.requiredQty)} {c.uom}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatQty(c.issuedQty)}</td>
                <td className="px-2 py-1.5 tabular-nums">{c.readiness ? formatQty(c.readiness.onHand) : "—"}</td>
                <td className="px-2 py-1.5 w-[110px]">
                  <input className={inputSm} inputMode="decimal" aria-label={`Issue ${c.material.code}`} value={qty[c.material.id]}
                    onChange={(e) => setQty((q) => ({ ...q, [c.material.id]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ErrorNote error={post.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Close</button>
          <button className={btnPrimary} disabled={!open.some((c) => Number(qty[c.material.id]) > 0) || post.isPending} onClick={() => post.mutate()}>
            {post.isPending ? "Posting…" : "Post issue"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutputDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const refresh = useRefreshProduction();
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const remaining = Math.max(0, Math.round((wo.plannedQty - wo.producedQty) * 1e6) / 1e6);
  const [quantity, setQuantity] = useState(String(remaining));
  const [scrap, setScrap] = useState("");
  const [complete, setComplete] = useState(true);
  const [overrideReason, setOverrideReason] = useState("");

  const post = useMutation({
    mutationFn: () => apiSend<{ lot: { lotNumber: string } | null }>("POST", `/work-orders/${wo.id}/output`, {
      quantity: Number(quantity || 0), scrappedQty: scrap ? Number(scrap) : undefined, complete,
      shortIssueReason: complete && overrideReason.trim() ? overrideReason.trim() : undefined,
    }, { idempotencyKey }),
    onSuccess: (r) => {
      toast.success(`Output recorded on ${wo.orderNumber}${r.lot ? ` · lot ${r.lot.lotNumber} (held for QC)` : ""}`);
      refresh(wo.id);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report output — {wo.orderNumber}</DialogTitle>
          <DialogDescription>
            Good output goes into stock as a new lot, held until quality releases it, valued at the actual cost of the materials issued.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Good quantity ({wo.uom})</span>
            <input className={inputSm} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label><span className={label}>Scrapped</span>
            <input className={inputSm} inputMode="decimal" value={scrap} onChange={(e) => setScrap(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
          This completes the order
        </label>
        {complete && <ShortIssueOverride value={overrideReason} onChange={setOverrideReason} />}
        <ErrorNote error={post.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Close</button>
          <button className={btnPrimary} disabled={post.isPending || !(Number(quantity) > 0 || Number(scrap) > 0 || complete)} onClick={() => post.mutate()}>
            {post.isPending ? "Posting…" : "Post output"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Completion is refused while components are issued short of the output; the
 * server names each one. Users allowed to override see a reason field — the
 * reason goes into the audit trail.
 */
function ShortIssueOverride({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { can } = useSession();
  if (!can("work-order:complete-short")) return null;
  return (
    <label className="block">
      <span className={label}>Reason to complete with components short (only if they are)</span>
      <textarea className={`${inputSm} h-16 rounded-lg py-1.5`} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500}
        placeholder="e.g. Yield beat the BOM; substitute material used" />
    </label>
  );
}

function CompleteDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const refresh = useRefreshProduction();
  const [overrideReason, setOverrideReason] = useState("");
  const complete = useMutation({
    mutationFn: () => apiSend("POST", `/work-orders/${wo.id}/complete`, overrideReason.trim() ? { shortIssueReason: overrideReason.trim() } : {}),
    onSuccess: () => {
      toast.success(`${wo.orderNumber} completed`);
      refresh(wo.id);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {wo.orderNumber}</DialogTitle>
          <DialogDescription>
            Closes the order to further output at {formatQty(wo.producedQty)} {wo.uom} produced. Every component must have been issued for that output.
          </DialogDescription>
        </DialogHeader>
        <ShortIssueOverride value={overrideReason} onChange={setOverrideReason} />
        <ErrorNote error={complete.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Close</button>
          <button className={btnPrimary} disabled={complete.isPending || (overrideReason.trim().length > 0 && overrideReason.trim().length < 3)} onClick={() => complete.mutate()}>
            {complete.isPending ? "Completing…" : "Complete order"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const refresh = useRefreshProduction();
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () => apiSend("POST", `/work-orders/${wo.id}/cancel`, { reason }),
    onSuccess: () => { toast.success(`${wo.orderNumber} cancelled`); refresh(wo.id); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {wo.orderNumber}</DialogTitle>
          <DialogDescription>Only possible while no material has been issued and nothing produced.</DialogDescription>
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
