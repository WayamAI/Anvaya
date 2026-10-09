"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnPrimary, btnSecondary, btnSecondarySm, btnGhostSm, inputSm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { ErrorNote } from "@/components/app/api-error-note";
import { SearchPicker } from "@/components/app/search-picker";
import { apiSend } from "@/lib/api";
import type { BomNode, BomVersionSummary } from "@/server/production/bom";

/**
 * Engineering changes to a bill of materials: start a BOM for a made product,
 * draft a new revision, and make a revision the active one.
 *
 * A revision is created inactive, so drafting one never changes what work
 * orders or MRP use until it is activated; activation is a separate, explicit
 * step. The server validates components (existence, cycles, units) on save.
 */

const label = "block text-caption text-muted-foreground mb-1";
const today = () => new Date().toISOString().slice(0, 10);

function useRefreshBoms() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["boms"] });
    void qc.invalidateQueries({ queryKey: ["bom"] });
    void qc.invalidateQueries({ queryKey: ["bom-component"] });
  };
}

interface MaterialOption { id: string; code: string; name: string; unit: { code: string } }
interface Line { material: MaterialOption | null; quantity: string; scrapPct: string }

/** The tree is per one unit of the parent; a revision states quantities per its base quantity. */
const fromTree = (tree: BomNode | undefined, base: number): Line[] =>
  tree?.children?.length
    ? tree.children.map((c) => ({
        material: { id: c.materialId, code: c.code, name: c.name, unit: { code: c.uom } },
        quantity: String(Math.round(c.qtyPerParent * base * 1e6) / 1e6),
        scrapPct: c.scrapFactor ? String(Math.round(c.scrapFactor * 10000) / 100) : "",
      }))
    : [{ material: null, quantity: "", scrapPct: "" }];

function nextRevision(versions: BomVersionSummary[]): string {
  const letters = versions.map((v) => v.version).filter((v) => /^[A-Z]$/.test(v)).sort();
  const last = letters[letters.length - 1];
  return last && last < "Z" ? String.fromCharCode(last.charCodeAt(0) + 1) : "";
}

function RevisionDialog({ bomId, bomCode, productUom, versions, tree, baseQuantity, onClose }: {
  bomId: string; bomCode: string; productUom: string; versions: BomVersionSummary[]; tree?: BomNode; baseQuantity: number; onClose: () => void;
}) {
  const refresh = useRefreshBoms();
  const [version, setVersion] = useState(nextRevision(versions));
  const [base, setBase] = useState(String(baseQuantity || 1));
  const [from, setFrom] = useState(today());
  const [lines, setLines] = useState<Line[]>(fromTree(tree, baseQuantity || 1));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const used = lines.filter((l) => l.material);
  const problems: string[] = [];
  if (!version.trim()) problems.push("Enter a revision label.");
  if (!(Number(base) > 0)) problems.push("Base quantity must be greater than 0.");
  if (!used.length) problems.push("Add at least one component.");
  used.forEach((l, i) => {
    if (!(Number(l.quantity) > 0)) problems.push(`Line ${i + 1}: quantity must be greater than 0.`);
    if (l.scrapPct !== "" && !(Number(l.scrapPct) >= 0 && Number(l.scrapPct) < 100)) problems.push(`Line ${i + 1}: scrap must be 0–99.99%.`);
  });

  const save = useMutation({
    mutationFn: () => apiSend("POST", `/boms/${bomId}/versions`, {
      version: version.trim(), baseQuantity: Number(base), effectiveFrom: from,
      components: used.map((l, i) => ({
        materialId: l.material!.id, quantity: Number(l.quantity), position: (i + 1) * 10,
        ...(l.scrapPct !== "" ? { scrapFactor: Number(l.scrapPct) / 100 } : {}),
      })),
    }),
    onSuccess: () => {
      toast.success(`${bomCode} rev ${version.trim()} saved as inactive; activate it to put it in use`);
      refresh();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New revision — {bomCode}</DialogTitle>
          <DialogDescription>Starts from the current revision. It is saved inactive and changes nothing until you activate it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label><span className={label}>Revision</span>
            <input className={inputSm} maxLength={20} value={version} onChange={(e) => setVersion(e.target.value)} /></label>
          <label><span className={label}>Base quantity ({productUom})</span>
            <input className={inputSm} inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} /></label>
          <label><span className={label}>Effective from</span>
            <input type="date" className={inputSm} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        </div>
        <div className="space-y-2">
          <span className={label}>Components per base quantity</span>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_100px_auto] gap-2 items-center">
              <SearchPicker<MaterialOption> endpoint="/materials" label={`Component ${i + 1}`} value={l.material}
                onChange={(m) => setLine(i, { material: m })} format={(m) => `${m.code} — ${m.name} (${m.unit.code})`} />
              <input className={inputSm} inputMode="decimal" placeholder="Qty" aria-label={`Component ${i + 1} quantity`}
                value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input className={inputSm} inputMode="decimal" placeholder="Scrap %" aria-label={`Component ${i + 1} scrap percent`}
                value={l.scrapPct} onChange={(e) => setLine(i, { scrapPct: e.target.value })} />
              <button type="button" className={btnGhostSm} aria-label={`Remove component ${i + 1}`} disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" className={btnGhostSm} onClick={() => setLines((ls) => [...ls, { material: null, quantity: "", scrapPct: "" }])}>Add component</button>
        </div>
        {problems.length > 0 && save.isIdle && used.length > 0 && <ul className="text-caption text-muted-foreground list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <ErrorNote error={save.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button className={btnPrimary} disabled={problems.length > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save revision"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewRevisionButton(props: { bomId: string; bomCode: string; productUom: string; versions: BomVersionSummary[]; tree?: BomNode; baseQuantity: number }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("bom:update")) return null;
  return (
    <>
      <button className={btnSecondary} onClick={() => setOpen(true)}>New revision</button>
      {open && <RevisionDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ActivateRevisionButton({ bomId, bomCode, version }: { bomId: string; bomCode: string; version: BomVersionSummary }) {
  const { can } = useSession();
  const refresh = useRefreshBoms();
  const [confirm, setConfirm] = useState(false);
  const activate = useMutation({
    mutationFn: () => apiSend("POST", `/boms/${bomId}/versions/${version.id}/activate`),
    onSuccess: () => { toast.success(`${bomCode} rev ${version.version} is now active`); refresh(); setConfirm(false); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!can("bom:update") || version.isActive) return null;
  return confirm ? (
    <span className="inline-flex items-center gap-1">
      <button className={btnSecondarySm} disabled={activate.isPending} onClick={() => activate.mutate()}>{activate.isPending ? "Activating…" : "Confirm"}</button>
      <button className={btnGhostSm} onClick={() => setConfirm(false)}>Cancel</button>
    </span>
  ) : (
    <button className={btnGhostSm} onClick={() => setConfirm(true)} title="Make this the revision new work orders and MRP use">Activate</button>
  );
}

export function NewBomButton({ product, onCreated }: { product: { materialId: string; code: string; name: string }; onCreated: () => void }) {
  const { can } = useSession();
  const refresh = useRefreshBoms();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(`BOM-${product.code}`);
  const [name, setName] = useState(product.name);
  const create = useMutation({
    mutationFn: () => apiSend<{ id: string; code: string }>("POST", "/boms", { materialId: product.materialId, code: code.trim(), name: name.trim() }),
    onSuccess: (b) => { toast.success(`${b.code} created — add its first revision`); refresh(); setOpen(false); onCreated(); },
  });
  if (!can("bom:create")) return null;
  return (
    <>
      <button className={btnPrimary} onClick={() => setOpen(true)}>Create BOM</button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && !create.isPending && setOpen(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New BOM — {product.code}</DialogTitle>
              <DialogDescription>Then add its first revision with the components.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3">
              <label><span className={label}>BOM code</span><input className={inputSm} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} /></label>
              <label><span className={label}>Name</span><input className={inputSm} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label>
            </div>
            <ErrorNote error={create.error} />
            <DialogFooter>
              <button className={btnSecondary} onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</button>
              <button className={btnPrimary} disabled={!code.trim() || !name.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create BOM"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
