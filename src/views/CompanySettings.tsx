import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
import { PageIcon } from "@/components/app/page-icon";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { ErrorNote } from "@/components/app/api-error-note";
import { btnPrimary, btnSecondary, inputSm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiSend } from "@/lib/api";

/**
 * Company, locations and operational settings, from the server. The
 * tolerances here are enforced by the write services: receipts, dispatches,
 * issues and output are refused beyond them.
 */

interface Company {
  code: string; name: string; legalName: string | null; taxId: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null;
  postalCode: string | null; country: string | null; currencyCode: string; timezone: string;
}
type Operational = Record<
  "purchasing.overReceiptTolerancePct" | "sales.overDispatchTolerancePct" | "production.overProductionTolerancePct" | "production.overIssueTolerancePct",
  number
> & { "purchasing.allowSelfApproval": boolean };
interface Location { id: string; code: string; name: string; type: string; city: string | null; state: string | null; isManufacturing: boolean; isActive: boolean }

const TOLERANCES: { key: keyof Omit<Operational, "purchasing.allowSelfApproval">; label: string; help: string }[] = [
  { key: "purchasing.overReceiptTolerancePct", label: "Over-receipt tolerance", help: "How far above the ordered quantity a PO line may be received." },
  { key: "sales.overDispatchTolerancePct", label: "Over-dispatch tolerance", help: "How far above the ordered quantity a sales order line may ship." },
  { key: "production.overIssueTolerancePct", label: "Over-issue tolerance", help: "Extra component a work order may draw beyond its requirement." },
  { key: "production.overProductionTolerancePct", label: "Over-production tolerance", help: "How far output may exceed a work order's planned quantity." },
];

function OperationalSettings({ values, canEdit }: { values: Operational; canEdit: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(values);
  useEffect(() => setDraft(values), [values]);
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => values[k as keyof Operational] !== v));

  const save = useMutation({
    mutationFn: () => apiSend("PATCH", "/settings", changed),
    onSuccess: () => { toast.success("Settings saved"); void qc.invalidateQueries({ queryKey: ["settings"] }); },
  });

  return (
    <div className="space-y-3">
      <h3 className="label-caps">Operational controls</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TOLERANCES.map((t) => (
          <label key={t.key} className="block">
            <span className="block text-body-sm font-medium">{t.label} (%)</span>
            <span className="block text-caption text-muted-foreground mb-1">{t.help}</span>
            <input className={inputSm} type="number" min={0} max={100} step="0.1" disabled={!canEdit}
              value={draft[t.key]} onChange={(e) => setDraft((d) => ({ ...d, [t.key]: Number(e.target.value) }))} />
          </label>
        ))}
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" disabled={!canEdit} checked={draft["purchasing.allowSelfApproval"]}
            onChange={(e) => setDraft((d) => ({ ...d, "purchasing.allowSelfApproval": e.target.checked }))} />
          <span>
            <span className="block text-body-sm font-medium">Allow buyers to approve their own purchase orders</span>
            <span className="block text-caption text-muted-foreground">Turn off to require a second person for every approval.</span>
          </span>
        </label>
      </div>
      <ErrorNote error={save.error} />
      {canEdit && (
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={!Object.keys(changed).length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          <button className={btnSecondary} disabled={!Object.keys(changed).length} onClick={() => setDraft(values)}>Discard</button>
        </div>
      )}
    </div>
  );
}

export default function CompanySettings() {
  const { theme } = useTheme();
  const { can } = useSession();
  const anvayaLogo = (theme === "dark" ? anvayaLogoDark : anvayaLogoLight).src;

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ company: Company; operational: Operational }>("/settings"),
    enabled: can("setting:read"),
  });
  const locations = useQuery({ queryKey: ["locations", "all"], queryFn: () => apiGet<Location[]>("/locations", { active: "all" }), enabled: can("location:read") });

  const c = settings.data?.company;
  const address = c ? [c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country].filter(Boolean).join(", ") : "";

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
        <PageIcon />
        <span className="min-w-0">Company & warehouses</span>
      </h1>

      {settings.error ? (
        <EmptyState title="Settings could not be loaded" description={(settings.error as Error).message}
          action={<button className={btnSecondary} onClick={() => void settings.refetch()}>Try again</button>} />
      ) : !c ? (
        <div className="space-y-2 p-6">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}</div>
      ) : (
        <div className="p-6">
          <div className="flex items-start gap-4">
            <img src={anvayaLogo} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-body-lg font-semibold">{c.legalName ?? c.name}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-body-md">
                <div><span className="text-muted-foreground">Tax ID:</span><br /><span className="font-medium identifier">{c.taxId ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Currency:</span><br /><span className="font-medium">{c.currencyCode}</span></div>
                <div><span className="text-muted-foreground">Time zone:</span><br /><span className="font-medium">{c.timezone}</span></div>
                <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Address:</span><br /><span className="font-medium">{address || "—"}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settings.data && <OperationalSettings values={settings.data.operational} canEdit={can("setting:update")} />}

      <div className="space-y-3">
        <h3 className="label-caps">Warehouses & plants</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {locations.data?.map((w) => (
            <div key={w.id} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-body-md font-semibold">{w.name}</h4>
                  <span className="text-caption identifier bg-secondary px-1.5 py-0.5 rounded">{w.code}</span>
                </div>
                <span className="text-body-sm text-muted-foreground">
                  {w.type.charAt(0) + w.type.slice(1).toLowerCase()}{w.isManufacturing ? " · manufacturing" : ""}
                  {[w.city, w.state].filter(Boolean).length ? ` · ${[w.city, w.state].filter(Boolean).join(", ")}` : ""}
                </span>
                <div className="mt-1 text-body-sm">
                  <span className={w.isActive ? "text-success font-medium" : "text-muted-foreground"}>{w.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
