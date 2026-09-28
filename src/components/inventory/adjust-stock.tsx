"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnGhostSm, btnPrimary, btnSecondary, inputSm, selectSm } from "@/components/app/controls";
import { ErrorNote, newIdempotencyKey } from "@/components/app/api-error-note";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiSend } from "@/lib/api";
import { formatQty } from "@/lib/format";

/**
 * Record a physical count. The user enters what is there; the server posts
 * the difference from the book, so re-submitting the same count changes
 * nothing. Batch-tracked material is counted per lot.
 */

const REASONS = [
  ["CYCLE_COUNT", "Cycle count"], ["DAMAGE", "Damage"], ["EXPIRY", "Expiry write-off"],
  ["FOUND", "Found stock"], ["LOSS", "Loss"], ["DATA_CORRECTION", "Data correction"],
] as const;

interface MaterialDetail {
  id: string; code: string; name: string; isBatchTracked: boolean; unit: { code: string };
  balances: { location: { id: string; name: string }; onHandQty: number; quarantineQty: number }[];
}
interface LotRow { id: string; lotNumber: string; remainingQty: number; qcStatus: string; location: { id: string } }

export function CountButton({ materialId, label }: { materialId: string; label: string }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("inventory:adjust")) return null;
  return (
    <>
      <button className={btnGhostSm} aria-label={`Record a count of ${label}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Count</button>
      {open && <AdjustStockDialog materialId={materialId} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdjustStockDialog({ materialId, onClose }: { materialId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const material = useQuery({ queryKey: ["material", materialId], queryFn: () => apiGet<MaterialDetail>(`/materials/${materialId}`) });
  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: () => apiGet<{ id: string; name: string }[]>("/locations") });
  const m = material.data;

  const [locationId, setLocationId] = useState("");
  const [lotId, setLotId] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("CYCLE_COUNT");
  const [notes, setNotes] = useState("");

  const lots = useQuery({
    queryKey: ["inventory", "lots", "count", materialId, locationId],
    queryFn: () => apiGet<LotRow[]>("/inventory/lots", { q: m!.code, locationId, limit: 200 }),
    enabled: !!m?.isBatchTracked && !!locationId,
  });
  const lotOptions = (lots.data ?? []).filter((l) => l.qcStatus !== "REJECTED");
  const balance = m?.balances.find((b) => b.location.id === locationId);
  const book = m?.isBatchTracked
    ? lotOptions.find((l) => l.id === lotId)?.remainingQty
    : balance ? balance.onHandQty - balance.quarantineQty : 0;

  const post = useMutation({
    mutationFn: () => apiSend<{ delta: number }>("POST", "/inventory/adjustments", {
      materialId, locationId, lotId: lotId || undefined, countedQty: Number(counted), reason, notes: notes || undefined,
    }, { idempotencyKey }),
    onSuccess: (r) => {
      toast.success(`${m!.code}: ${r.delta > 0 ? "+" : ""}${formatQty(r.delta)} ${m!.unit.code} posted`);
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["material", materialId] });
      onClose();
    },
  });

  const ready = locationId && counted !== "" && Number(counted) >= 0 && (!m?.isBatchTracked || lotId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Record a count{m ? ` — ${m.code}` : ""}</DialogTitle>
          <DialogDescription>Enter what is physically there. The difference from the book is posted as an adjustment and audited.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label><span className="block text-caption text-muted-foreground mb-1">Location</span>
            <select className={selectSm} value={locationId} onChange={(e) => { setLocationId(e.target.value); setLotId(""); }}>
              <option value="">Choose…</option>
              {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {m?.isBatchTracked && (
            <label><span className="block text-caption text-muted-foreground mb-1">Lot</span>
              <select className={selectSm} value={lotId} disabled={!locationId} onChange={(e) => setLotId(e.target.value)}>
                <option value="">{lots.isFetching ? "Loading…" : "Choose…"}</option>
                {lotOptions.filter((l) => l.location.id === locationId).map((l) => (
                  <option key={l.id} value={l.id}>{l.lotNumber} ({formatQty(l.remainingQty)} · {l.qcStatus.toLowerCase()})</option>
                ))}
              </select>
            </label>
          )}
          <label><span className="block text-caption text-muted-foreground mb-1">Counted ({m?.unit.code ?? "qty"}){book !== undefined && locationId ? ` · book ${formatQty(book)}` : ""}</span>
            <input className={inputSm} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </label>
          <label><span className="block text-caption text-muted-foreground mb-1">Reason</span>
            <select className={selectSm} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label><span className="block text-caption text-muted-foreground mb-1">Notes</span>
          <input className={inputSm} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </label>
        <ErrorNote error={post.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!ready || post.isPending} onClick={() => post.mutate()}>
            {post.isPending ? "Posting…" : "Post count"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
