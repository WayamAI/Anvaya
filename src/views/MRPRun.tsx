import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { ErrorNote } from "@/components/app/api-error-note";
import { btnGhostSm, btnPrimary, btnSecondary, selectSm } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * MRP run and results, from the engine: run parameters, the latest run,
 * planned orders (convertible into draft POs and work orders), exceptions,
 * and pegging for any planned order.
 */

interface Run {
  id: string; runNumber: string; status: string; asOfDate: string; horizonDays: number; bucketSizeDays: number;
  triggeredBy: string; startedAt: string | null; completedAt: string | null; durationMs: number | null; errorMessage: string | null;
  materialsPlanned: number; plannedOrderCount: number; exceptionCount: number; isLatest: boolean;
  parameters: Record<string, unknown>;
}
interface PlannedOrder {
  id: string; type: "PURCHASE" | "PRODUCTION"; status: string;
  material: { id: string; code: string; name: string }; uom: string; location: { id: string; name: string };
  quantity: number; releaseDate: string; requiredDate: string; leadTimeDays: number; leadTimeSource: string | null;
  vendor: { code: string; name: string } | null; pastDue: boolean; summary: string | null; demands: string[];
  convertedTo: { type: string; number: string | null } | null;
}
interface MrpException {
  id: string; type: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; message: string; suggestedAction: string | null;
  material: { code: string; name: string } | null; location: { name: string } | null; dueDate: string | null; daysLate: number | null;
  isResolved: boolean;
}
interface PlannedOrderDetail {
  id: string; material: string; materialName: string; uom: string; location: string; quantity: number; type: string;
  releaseDate: string; requiredDate: string;
  explanation: { summary: string | null; steps: { label: string; value: number | string; detail?: string }[] } | null;
  pegging: { demandSourceType: string; reference: string | null; quantity: number; requiredDate: string; parent: { material: string; quantity: number } | null }[];
  components: { plannedOrderId: string; type: string; material: string; materialName: string; uom: string; quantity: number }[];
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const fmtDuration = (ms: number | null) => (ms === null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const severityColor = { CRITICAL: "red", HIGH: "red", MEDIUM: "amber", LOW: "gray" } as const;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const SOURCE_LABEL: Record<string, string> = {
  SALES_ORDER: "Sales order", FORECAST: "Forecast", DEPENDENT: "Component of", WORK_ORDER: "Work order", SAFETY_STOCK: "Safety stock",
};

function PeggingPanel({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const q = useQuery({ queryKey: ["mrp", "planned-order", id], queryFn: () => apiGet<PlannedOrderDetail>(`/mrp/planned-orders/${id}`) });
  if (q.isPending) return <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}</div>;
  if (q.error) return <EmptyState title="Could not load the planned order" description={q.error.message} />;
  const o = q.data;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h4 className="text-body-md font-semibold">{o.type === "PRODUCTION" ? "Make" : "Buy"} {formatQty(o.quantity)} {o.uom} {o.material} <span className="font-normal text-muted-foreground">— {o.materialName}, {o.location}</span></h4>
        <p className="text-body-sm text-muted-foreground">Release {fmtDate(o.releaseDate)} · needed {fmtDate(o.requiredDate)}</p>
        <h5 className="label-caps mt-4 mb-1">How it was calculated</h5>
        <table className="data-table w-full text-body-sm">
          <tbody>
            {o.explanation?.steps.map((s, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-1.5 pr-3 text-muted-foreground">{s.label}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{typeof s.value === "number" ? formatQty(s.value) : fmtDate(String(s.value))}</td>
                <td className="py-1.5 text-caption text-muted-foreground">{s.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h5 className="label-caps mb-1">Demand it satisfies (pegging)</h5>
        <ul className="space-y-1 text-body-sm">
          {o.pegging.length ? o.pegging.map((p, i) => (
            <li key={i} className="rounded bg-secondary/50 px-2 py-1.5">
              <span className="text-muted-foreground">{SOURCE_LABEL[p.demandSourceType] ?? p.demandSourceType}</span>{" "}
              <span className="identifier font-medium">{p.parent ? `planned ${p.parent.material} ×${formatQty(p.parent.quantity)}` : p.reference}</span>
              <span className="text-muted-foreground"> · {formatQty(p.quantity)} {o.uom} by {fmtDate(p.requiredDate)}</span>
            </li>
          )) : <li className="text-muted-foreground">Lot-size surplus only; no specific demand.</li>}
        </ul>
        {o.components.length > 0 && (
          <>
            <h5 className="label-caps mt-4 mb-1">Component demand it creates</h5>
            <ul className="space-y-1 text-body-sm">
              {o.components.map((c) => (
                <li key={c.plannedOrderId + c.material}>
                  <button className="underline-offset-2 hover:underline" onClick={() => onSelect(c.plannedOrderId)}>
                    <span className="identifier">{c.material}</span> {c.materialName}
                  </button>
                  <span className="text-muted-foreground"> · {formatQty(c.quantity)} {c.uom} ({c.type.toLowerCase()})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default function MRPRun() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"planned" | "exceptions" | "pegging">("planned");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pegged, setPegged] = useState<string | null>(null);
  const [params, setParams] = useState({ horizonDays: 90, bucketSizeDays: 1 as 1 | 7, includeForecast: true, respectSafetyStock: true });

  const runQ = useQuery({
    queryKey: ["mrp", "run", "latest"],
    queryFn: async () => {
      try {
        return await apiGet<Run>("/mrp/runs/latest");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const run = runQ.data ?? null;
  const ordersQ = useQuery({ queryKey: ["mrp", "planned", run?.id], queryFn: () => apiGet<PlannedOrder[]>(`/mrp/runs/${run!.id}/planned-orders`), enabled: !!run });
  const exceptionsQ = useQuery({ queryKey: ["mrp", "exceptions", run?.id], queryFn: () => apiGet<MrpException[]>(`/mrp/runs/${run!.id}/exceptions`), enabled: !!run });

  const refresh = () => {
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ["mrp"] });
  };

  const start = useMutation({
    mutationFn: () => apiSend<Run>("POST", "/mrp/runs", params),
    onSuccess: (r) => { toast.success(`${r.runNumber}: ${r.plannedOrderCount} planned orders, ${r.exceptionCount} exceptions`); refresh(); },
    onError: (e) => { toast.error((e as Error).message); refresh(); },
  });
  const convert = useMutation({
    mutationFn: () => apiSend<{ purchaseOrders: { orderNumber: string }[]; workOrders: { orderNumber: string }[] }>(
      "POST", `/mrp/runs/${run!.id}/convert`, { plannedOrderIds: [...selected] }),
    onSuccess: (r) => {
      const made = [...r.purchaseOrders.map((p) => p.orderNumber), ...r.workOrders.map((w) => w.orderNumber)];
      toast.success(`Created ${made.join(", ")}`);
      refresh();
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["work-orders"] });
    },
  });
  const resolve = useMutation({
    mutationFn: (id: string) => apiSend("POST", `/mrp/exceptions/${id}/resolve`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mrp", "exceptions"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const exceptionList = exceptionsQ.data ?? [];
  const openExceptions = exceptionList.filter((e) => !e.isResolved).length;
  const convertible = useMemo(() => new Set(orders.filter((o) => o.status === "PLANNED" && (o.type === "PRODUCTION" || o.vendor)).map((o) => o.id)), [orders]);
  const canConvert = can("mrp:run") && run?.isLatest;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const columns: Column<PlannedOrder>[] = [
    ...(canConvert ? [{
      key: "select", header: "", width: "w-[44px]", sortable: false,
      cell: (o: PlannedOrder) => (
        <input type="checkbox" className="rounded" aria-label={`Select ${o.material.code}`} disabled={!convertible.has(o.id)}
          checked={selected.has(o.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(o.id)} />
      ),
    } satisfies Column<PlannedOrder>] : []),
    { key: "type", header: "Type", width: "w-[90px]", value: (o) => o.type, cell: (o) => (o.type === "PURCHASE" ? "Buy" : "Make") },
    { key: "code", header: "Code", width: "w-[96px]", value: (o) => o.material.code, cell: (o) => <span className="identifier text-body-sm">{o.material.code}</span> },
    { key: "name", header: "Material", value: (o) => o.material.name, cell: (o) => <span className="font-medium">{o.material.name}</span> },
    { key: "location", header: "Location", width: "w-[120px]", value: (o) => o.location.name, cell: (o) => <span className="text-muted-foreground">{o.location.name}</span> },
    { key: "qty", header: "Quantity", align: "right", numeric: true, width: "w-[120px]", value: (o) => o.quantity, cell: (o) => `${formatQty(o.quantity)} ${o.uom}` },
    {
      key: "release", header: "Release", width: "w-[130px]", value: (o) => o.releaseDate,
      cell: (o) => <span className={o.pastDue ? "text-danger font-medium" : ""}>{fmtDate(o.releaseDate)}{o.pastDue ? " (late)" : ""}</span>,
    },
    { key: "required", header: "Needed", width: "w-[120px]", value: (o) => o.requiredDate, cell: (o) => fmtDate(o.requiredDate) },
    { key: "vendor", header: "Vendor", value: (o) => o.vendor?.name ?? "", cell: (o) => (o.type === "PRODUCTION" ? <span className="text-muted-foreground">In-house</span> : o.vendor?.name ?? <span className="text-danger">None</span>) },
    { key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[80px]", value: (o) => o.leadTimeDays, cell: (o) => o.leadTimeDays },
    { key: "demand", header: "For", value: (o) => o.demands.join(", "), cell: (o) => <span className="text-caption text-muted-foreground">{o.demands.slice(0, 2).join(", ")}{o.demands.length > 2 ? "…" : ""}</span> },
    {
      key: "status", header: "Status", width: "w-[140px]", value: (o) => o.status,
      cell: (o) => o.convertedTo
        ? <StatusBadge status="green" label={o.convertedTo.number ?? "Converted"} />
        : <StatusBadge status={o.pastDue ? "red" : "blue"} label={titleCase(o.status)} />,
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <PageHeader
        title="MRP run & results"
        description="Planned orders, exceptions and pegging from the latest material requirements run."
        actions={can("mrp:run") ? (
          <>
            <select className={cn(selectSm, "w-auto")} aria-label="Horizon" value={params.horizonDays}
              onChange={(e) => setParams((p) => ({ ...p, horizonDays: Number(e.target.value) }))}>
              {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d}-day horizon</option>)}
            </select>
            <select className={cn(selectSm, "w-auto")} aria-label="Buckets" value={params.bucketSizeDays}
              onChange={(e) => setParams((p) => ({ ...p, bucketSizeDays: Number(e.target.value) as 1 | 7 }))}>
              <option value={1}>Daily buckets</option><option value={7}>Weekly buckets</option>
            </select>
            <label className="flex items-center gap-1.5 text-body-sm">
              <input type="checkbox" checked={params.includeForecast} onChange={(e) => setParams((p) => ({ ...p, includeForecast: e.target.checked }))} /> Forecast
            </label>
            <label className="flex items-center gap-1.5 text-body-sm">
              <input type="checkbox" checked={params.respectSafetyStock} onChange={(e) => setParams((p) => ({ ...p, respectSafetyStock: e.target.checked }))} /> Safety stock
            </label>
            <button onClick={() => start.mutate()} disabled={start.isPending} className={btnPrimary}>
              <Zap /> {start.isPending ? "Running…" : "Run MRP now"}
            </button>
          </>
        ) : undefined}
      />

      {runQ.isPending ? (
        <SkeletonBlock className="h-5 w-2/3" />
      ) : runQ.error ? (
        <EmptyState title="MRP results could not be loaded" description={runQ.error.message}
          action={<button className={btnSecondary} onClick={() => void runQ.refetch()}>Try again</button>} />
      ) : !run ? (
        <EmptyState title="No MRP run yet" description={can("mrp:run") ? "Run MRP to plan requirements from current stock, orders and forecasts." : "Ask a planner to run MRP."} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-body-md">
          <div><span className="text-muted-foreground">Run:</span> <span className="identifier font-medium">{run.runNumber}</span></div>
          <div><span className="text-muted-foreground">Planning date:</span> <span className="font-medium">{fmtDate(run.asOfDate)}</span></div>
          <div><span className="text-muted-foreground">Completed:</span> <span className="font-medium">{run.completedAt ? new Date(run.completedAt).toLocaleString("en-GB") : "—"}</span> <span className="text-muted-foreground">by {run.triggeredBy}</span></div>
          <div><span className="text-muted-foreground">Horizon:</span> <span className="font-medium">{run.horizonDays} days, {run.bucketSizeDays === 7 ? "weekly" : "daily"}</span></div>
          <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{fmtDuration(run.durationMs)}</span></div>
          <div><span className="text-muted-foreground">Materials:</span> <span className="font-semibold">{run.materialsPlanned}</span></div>
          <div><span className="text-muted-foreground">Planned orders:</span> <span className="font-semibold">{run.plannedOrderCount}</span></div>
          <div><span className="text-muted-foreground">Open exceptions:</span> <span className={cn("font-semibold", openExceptions ? "text-danger" : "")}>{exceptionsQ.data ? openExceptions : run.exceptionCount}</span></div>
        </div>
      )}
      <ErrorNote error={start.error} />

      {run && (
        <>
          <div className="flex gap-1 border-b border-border">
            {([["planned", `Planned orders (${orders.length})`], ["exceptions", `Exceptions (${openExceptions})`], ["pegging", "Pegging"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`-mb-px px-4 py-2 text-body-md font-medium border-b-2 transition-colors ${tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "planned" && (
            <div className="space-y-3">
              {canConvert && (
                <div className="flex flex-wrap items-center gap-2 text-body-sm">
                  <button className={btnGhostSm} onClick={() => setSelected(new Set(convertible))}>Select all convertible ({convertible.size})</button>
                  {selected.size > 0 && <button className={btnGhostSm} onClick={() => setSelected(new Set())}>Clear</button>}
                  <button className={btnPrimary} disabled={!selected.size || convert.isPending} onClick={() => convert.mutate()}>
                    {convert.isPending ? "Converting…" : `Convert ${selected.size || ""} to orders`}
                  </button>
                  <span className="text-muted-foreground">Purchases become draft POs grouped by vendor; production becomes work orders.</span>
                </div>
              )}
              <ErrorNote error={convert.error} />
              <DataTable
                columns={columns}
                rows={orders}
                rowKey={(o) => o.id}
                name="Planned orders"
                loading={ordersQ.isPending}
                searchable
                columnToggle
                exportable
                pageSize={25}
                onRowClick={(o) => { setPegged(o.id); setTab("pegging"); }}
                empty={<EmptyState title="Nothing to order" description="Stock and open supply cover every requirement in the horizon." />}
              />
            </div>
          )}

          {tab === "exceptions" && (
            exceptionList.length === 0
              ? <EmptyState title="No exceptions" description="The plan needs no attention." />
              : (
                <div className="overflow-x-auto">
                  <table className="data-table w-full text-body-md">
                    <thead><tr className="border-b border-border">
                      {["Severity", "Type", "Material", "Detail", "Recommended action", ""].map((h) => <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {exceptionList.map((e) => (
                        <tr key={e.id} className={cn("border-b border-border", e.isResolved && "opacity-50")}>
                          <td className="px-3 py-2"><StatusBadge status={severityColor[e.severity]} label={titleCase(e.severity)} /></td>
                          <td className="px-3 py-2 whitespace-nowrap">{titleCase(e.type)}</td>
                          <td className="px-3 py-2"><span className="identifier">{e.material?.code ?? "—"}</span> <span className="text-muted-foreground">{e.location?.name ?? ""}</span></td>
                          <td className="px-3 py-2">{e.message}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.suggestedAction ?? "—"}</td>
                          <td className="px-3 py-2">
                            {e.isResolved ? <span className="text-caption text-muted-foreground">Resolved</span>
                              : can("mrp:run") && <button className={btnGhostSm} disabled={resolve.isPending} onClick={() => resolve.mutate(e.id)}>Resolve</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {tab === "pegging" && (
            pegged ? <PeggingPanel id={pegged} onSelect={setPegged} />
              : <EmptyState title="Choose a planned order" description="Click a row on the Planned orders tab to see how it was calculated and what demand it serves." />
          )}
        </>
      )}
    </div>
  );
}
