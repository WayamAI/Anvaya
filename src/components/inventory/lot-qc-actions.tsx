"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { btnDestructive, btnPrimary, btnSecondary, inputSm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { ErrorNote } from "@/components/purchasing/po-actions";
import { apiSend } from "@/lib/api";

/**
 * Quality decision on a lot: release, hold or reject.
 *
 * Offered to users with `inventory:update`, and only for decisions the lot
 * can still take — a rejected lot is final. Holding or rejecting needs a
 * reason; releasing a purchased lot needs a CoA on record, which the server
 * enforces and reports back against the CoA field.
 */

type Decision = "APPROVED" | "QUARANTINE" | "REJECTED";

export function LotQcActions({ lot }: { lot: { id: string; lotNumber: string; qcStatus: string; coaReference?: string | null } }) {
  const { can } = useSession();
  const qc = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [coa, setCoa] = useState(lot.coaReference ?? "");

  const decide = useMutation({
    mutationFn: (status: Decision) => apiSend("POST", `/inventory/lots/${lot.id}/qc`, {
      status, reason: reason || undefined, coaReference: coa || undefined,
    }),
    onSuccess: (_d, status) => {
      toast.success(`Lot ${lot.lotNumber} ${status === "APPROVED" ? "released" : status === "QUARANTINE" ? "put on hold" : "rejected"}`);
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["purchase-order"] });
      setDecision(null);
      setReason("");
    },
  });

  if (!can("inventory:update") || lot.qcStatus === "REJECTED") return null;

  const options: { status: Decision; label: string; cls: string }[] = [
    { status: "APPROVED" as const, label: "Release", cls: btnPrimary },
    { status: "QUARANTINE" as const, label: "Hold", cls: btnSecondary },
    { status: "REJECTED" as const, label: "Reject", cls: btnDestructive },
  ].filter((o) => o.status !== lot.qcStatus);

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
      <h4 className="text-body-sm font-semibold">Quality decision</h4>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.status} className={decision === o.status ? `${o.cls} ring-2 ring-ring/30` : o.cls}
            onClick={() => { setDecision(o.status); decide.reset(); }}>
            {o.label}
          </button>
        ))}
      </div>

      {decision && (
        <div className="space-y-2">
          {decision === "APPROVED" ? (
            <label className="block"><span className="block text-caption text-muted-foreground mb-1">Certificate of analysis reference</span>
              <input className={inputSm} value={coa} onChange={(e) => setCoa(e.target.value)} maxLength={100} />
            </label>
          ) : (
            <label className="block">
              <span className="block text-caption text-muted-foreground mb-1">
                Reason{decision === "REJECTED" ? " — what remains of the lot leaves stock (returned to the vendor, or scrapped). This cannot be undone." : ""}
              </span>
              <input className={inputSm} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </label>
          )}
          <ErrorNote error={decide.error} />
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={() => setDecision(null)}>Cancel</button>
            <button className={decision === "REJECTED" ? btnDestructive : btnPrimary}
              disabled={decide.isPending || (decision !== "APPROVED" && reason.trim().length === 0)}
              onClick={() => decide.mutate(decision)}>
              {decide.isPending ? "Saving…" : `Confirm ${decision === "APPROVED" ? "release" : decision === "QUARANTINE" ? "hold" : "rejection"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
