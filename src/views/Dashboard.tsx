"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Zap, FileText, Package, Hash } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { MetricRow, type Metric } from "@/components/app/metric-row";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnPrimary, btnSecondary } from "@/components/app/controls";
import { useSession } from "@/components/auth/session-context";
import { ApiError, apiGet } from "@/lib/api";
import { formatQty, inrCompact } from "@/lib/format";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import type { MrpException } from "@/components/mrp/exceptions-panel";
import type { ExhaustionAlerts } from "@/server/inventory/exhaustion";
import type { InventoryHealth } from "@/server/inventory/health";
import type { LotIndicators } from "@/server/inventory/lots";
import type { PurchaseOrderList } from "@/server/purchasing/purchase-orders";
import type { WorkOrderList, WorkOrderRow } from "@/server/production/work-orders";
import type { SalesOrderList } from "@/server/sales/sales-orders";

/**
 * The landing screen: headline figures from each area the user may read, the
 * latest MRP run, materials closest to running short, stock about to run out,
 * the coming week's production and the plan's open exceptions. Each section
 * is fetched only with that area's read permission and left out without it.
 */

interface Run {
  id: string; runNumber: string; asOfDate: string; completedAt: string | null; durationMs: number | null; triggeredBy: string;
  materialsPlanned: number; plannedOrderCount: number;
  openExceptions: { bySeverity: Record<string, number> };
  plannedOrders: { type: string; status: string; count: number }[];
}
interface Requirement {
  material: { id: string; code: string; name: string }; location: { id: string; name: string };
  coverDays: number | null; horizonDays: number; status: "critical" | "short" | "covered" | "adequate";
}

const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDuration = (ms: number | null) => (ms === null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const DAY = 86_400_000;
const OPEN_WO = ["PLANNED", "FIRMED", "RELEASED", "IN_PROGRESS"] as const;

function SectionError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return <EmptyState title="Could not load" description={error.message} action={<button className={btnSecondary} onClick={onRetry}>Try again</button>} />;
}

export default function Dashboard() {
  const router = useRouter();
  const { can } = useSession();
  const mrp = can("mrp:read");
  const inv = can("inventory:read");
  const pos = can("purchase-order:read");
  const wos = can("work-order:read");
  const sos = can("sales-order:read");

  const runQ = useQuery({
    queryKey: ["mrp", "run", "latest"],
    enabled: mrp,
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
  const reqQ = useQuery({ queryKey: ["mrp", "materials", run?.id], queryFn: () => apiGet<Requirement[]>(`/mrp/runs/${run!.id}/materials`), enabled: !!run });
  const excQ = useQuery({ queryKey: ["mrp", "exceptions", run?.id, "dashboard"], queryFn: () => apiGet<MrpException[]>(`/mrp/runs/${run!.id}/exceptions`, { limit: 100 }), enabled: !!run });
  const alertsQ = useQuery({ queryKey: ["inventory", "exhaustion-alerts"], queryFn: () => apiGet<ExhaustionAlerts>("/inventory/exhaustion-alerts"), enabled: inv });
  const healthQ = useQuery({ queryKey: ["inventory", "health"], queryFn: () => apiGet<InventoryHealth>("/inventory/health"), enabled: inv });
  const lotsQ = useQuery({ queryKey: ["inventory", "lots", "indicators"], queryFn: () => apiGet<LotIndicators>("/inventory/lots/indicators"), enabled: inv });
  const poQ = useQuery({ queryKey: ["purchase-orders", "counts"], queryFn: () => apiGet<PurchaseOrderList>("/purchase-orders", { limit: 1 }), enabled: pos });
  const woQ = useQuery({ queryKey: ["work-orders", "dashboard"], queryFn: () => apiGet<WorkOrderList>("/work-orders", { limit: 200 }), enabled: wos });
  const soQ = useQuery({ queryKey: ["sales-orders", "counts"], queryFn: () => apiGet<SalesOrderList>("/sales-orders", { limit: 1 }), enabled: sos });

  const requirements = useMemo(() => reqQ.data ?? [], [reqQ.data]);
  const atRisk = requirements.filter((r) => r.status === "critical" || r.status === "short");
  const openExceptions = run ? Object.values(run.openExceptions?.bySeverity ?? {}).reduce((a, b) => a + b, 0) : 0;
  const plannedToPlace = run?.plannedOrders.filter((g) => g.status === "PLANNED").reduce((a, g) => a + g.count, 0) ?? 0;

  // Figures from each area the user can read; "—" while a figure loads.
  const v = (loaded: unknown, value: string | number) => (loaded === undefined ? "—" : value);
  const metrics: Metric[] = [];
  if (mrp) {
    metrics.push({
      label: "Materials at risk", iconName: "materials-risk",
      value: run === null ? 0 : v(reqQ.data, atRisk.length),
      hint: run === null ? "No MRP run yet" : `${requirements.filter((r) => r.status === "critical").length} critical`,
      tone: atRisk.length ? "danger" : "default",
    });
    metrics.push({
      label: "Open MRP exceptions", iconName: "open-exceptions", value: run === null ? 0 : v(runQ.data, openExceptions),
      hint: run ? `${plannedToPlace} planned orders to place` : undefined, tone: openExceptions ? "warning" : "default",
    });
  }
  if (pos) {
    const c = poQ.data?.counts;
    const open = c ? c.DRAFT + c.APPROVED + c.ORDERED + c.PARTIALLY_RECEIVED : 0;
    metrics.push({ label: "Open purchase orders", iconName: "purchase-orders", value: v(c, open), hint: c ? `${c.overdue} overdue · ${c.DRAFT} draft` : undefined, tone: c?.overdue ? "danger" : "default" });
  }
  if (wos) {
    const c = woQ.data?.counts;
    const open = c ? OPEN_WO.reduce((a, s) => a + c[s], 0) : 0;
    metrics.push({ label: "Open work orders", iconName: "pending-work-orders", value: v(c, open), hint: c ? `${c.overdue} overdue` : undefined, tone: c?.overdue ? "warning" : "default" });
  }
  if (sos) {
    const k = soQ.data?.kpis;
    metrics.push({
      label: "Open sales orders", iconName: "total-pos", value: v(k, k?.open.count ?? 0),
      hint: k ? `${inrCompact(k.open.value)} · ${soQ.data!.counts.overdue} overdue` : undefined, tone: soQ.data?.counts.overdue ? "warning" : "default",
    });
  }
  if (inv) {
    const h = healthQ.data;
    metrics.push({
      label: "Inventory health", iconName: "inventory-health", value: h ? (h.overall.score ?? "—") : "—",
      hint: h ? (h.overall.score === null ? "Not enough data to score" : `of 100 · target ${h.target}`) : undefined,
      tone: h?.overall.score != null && h.overall.score < h.target ? "warning" : "default",
    });
    const l = lotsQ.data;
    metrics.push({ label: "Trace completeness", iconName: "trace-completeness", value: l ? (l.backwardPct === null ? "—" : `${l.backwardPct}%`) : "—", hint: l ? `Backward, across ${l.lotCount} lots` : undefined });
    metrics.push({
      label: "Lots needing containment", iconName: "suspect-lots", value: v(l, l?.containmentLots ?? 0),
      hint: l ? `${l.expiring.length} expiring in ${l.expiryWindowDays} days` : undefined, tone: l?.containmentLots ? "danger" : "default",
    });
  }

  const lowestCover = useMemo(() => requirements
    .filter((r) => r.status !== "adequate")
    .map((r) => ({ name: r.material.code, label: `${r.material.name} — ${r.location.name}`, cover: r.coverDays ?? r.horizonDays, beyond: r.coverDays === null }))
    .sort((a, b) => a.cover - b.cover)
    .slice(0, 10), [requirements]);

  // Open work orders starting within the next seven days (or already late).
  const asOf = woQ.data?.asOf;
  const upcoming = useMemo(() => {
    if (!woQ.data || !asOf) return [];
    const until = Date.parse(asOf) + 7 * DAY;
    return woQ.data.orders
      .filter((w) => (OPEN_WO as readonly string[]).includes(w.status) && Date.parse(w.plannedStartDate) <= until)
      .sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate))
      .slice(0, 7);
  }, [woQ.data, asOf]);

  const scheduleColumns: Column<WorkOrderRow>[] = [
    {
      key: "product", header: "Product",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <span title={r.overdue ? "Overdue" : r.status} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${r.overdue ? "bg-danger" : r.status === "PLANNED" ? "bg-warning" : "bg-success"}`} />
          <span className="truncate">{r.product.name}</span>
        </span>
      ),
    },
    { key: "qty", header: "Qty", align: "right", numeric: true, width: "w-[80px]", cell: (r) => formatQty(r.plannedQty) },
    { key: "date", header: "Start", align: "right", width: "w-[76px]", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.plannedStartDate)}</span> },
  ];

  const exceptions = (excQ.data ?? []).filter((e) => !e.isResolved);
  const severityColor = { CRITICAL: "red", HIGH: "red", MEDIUM: "amber", LOW: "gray" } as const;
  const exceptionColumns: Column<MrpException>[] = [
    { key: "severity", header: "Severity", width: "w-[110px]", value: (e) => e.severity, cell: (e) => <StatusBadge status={severityColor[e.severity]} label={e.severity.charAt(0) + e.severity.slice(1).toLowerCase()} /> },
    { key: "material", header: "Material", width: "w-[130px]", value: (e) => e.material?.code ?? "", cell: (e) => <span className="identifier text-body-sm">{e.material?.code ?? "—"}</span> },
    { key: "message", header: "Exception", value: (e) => e.message, cell: (e) => e.message },
    { key: "action", header: "Suggested action", value: (e) => e.suggestedAction ?? "", cell: (e) => <span className="text-muted-foreground">{e.suggestedAction ?? "—"}</span> },
    { key: "due", header: "Due", width: "w-[100px]", value: (e) => e.dueDate ?? "", cell: (e) => (e.dueDate ? fmtDate(e.dueDate) : "—") },
  ];

  const noAccess = !mrp && !inv && !pos && !wos && !sos;

  return (
    <div className="px-6 py-5">
      <PageHeader
        title="Dashboard"
        description="Material planning, production readiness and supply at a glance."
        actions={
          <>
            {mrp && (
              <button onClick={() => router.push("/purchase-planning")} className={btnSecondary}>
                <FileText /> Purchase plan
              </button>
            )}
            {mrp && (
              <button onClick={() => router.push("/mrp-run")} className={btnPrimary}>
                <Zap /> {can("mrp:run") ? "Run MRP" : "MRP results"}
              </button>
            )}
          </>
        }
      />

      {noAccess ? (
        <EmptyState title="Nothing to show yet" description="Your role does not include access to planning, inventory or order data. Ask an administrator if you need it." />
      ) : (
        <MetricRow metrics={metrics} />
      )}

      {(mrp || inv) && (
        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
          {mrp && (
            <Section
              title="Lowest material cover"
              iconName="material-coverage"
              description={run ? `Days until stock falls below safety stock · ${run.runNumber}` : "From the latest MRP run"}
              actions={<button onClick={() => router.push("/material-coverage")} className="text-body-sm text-muted-foreground transition-colors hover:text-foreground">View all</button>}
            >
              {runQ.error ? <SectionError error={runQ.error} onRetry={() => void runQ.refetch()} />
                : reqQ.error ? <SectionError error={reqQ.error} onRetry={() => void reqQ.refetch()} />
                  : runQ.isPending || (run && reqQ.isPending) ? <SkeletonBlock className="h-[260px] w-full" />
                    : !run ? <EmptyState title="No MRP run yet" description="Run MRP to see how long stock will last." />
                      : lowestCover.length === 0 ? <EmptyState title="No demand in the plan" description="No material has requirements in the horizon." />
                        : (
                          <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={lowestCover} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} interval={0} />
                              <YAxis width={44} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} label={{ value: "Days of cover", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: CHART_COLORS.axis, textAnchor: "middle" } }} />
                              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }}
                                labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""}
                                formatter={(val: number, _n, p) => [`${val}${(p.payload as { beyond: boolean }).beyond ? "+" : ""} days`, "Cover"]} />
                              <ReferenceLine y={14} stroke={CHART_COLORS.primary} strokeDasharray="5 5" label={{ value: "14 days", fontSize: 10, fill: CHART_COLORS.primary, position: "insideTopLeft" }} />
                              {/* A material with no cover left still gets a visible stub: it is the most urgent bar. */}
                              <Bar dataKey="cover" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} minPointSize={3} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
            </Section>
          )}

          {inv && (
            <Section title="Stock value by location" iconName="trend-chart" description={healthQ.data ? `${inrCompact(healthQ.data.totals.value)} across ${healthQ.data.totals.stockedSkus} stocked SKUs` : "Valued at standard cost"}>
              {healthQ.error ? <SectionError error={healthQ.error} onRetry={() => void healthQ.refetch()} />
                : healthQ.isPending ? <SkeletonBlock className="h-[260px] w-full" />
                  : healthQ.data.byLocation.length === 0 ? <EmptyState title="No stock recorded" description="Stock value appears once receipts or opening balances are posted." />
                    : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={healthQ.data.byLocation} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} interval={0} />
                          <YAxis width={56} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} tickFormatter={(n: number) => inrCompact(n)} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }} formatter={(val: number) => [inrCompact(val), "Stock value"]} />
                          <Bar dataKey="value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
            </Section>
          )}
        </div>
      )}

      {(mrp || inv || wos) && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {mrp && (
            <Section title="MRP run status">
              {runQ.error ? <SectionError error={runQ.error} onRetry={() => void runQ.refetch()} />
                : runQ.isPending ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-5 w-full" />)}</div>
                  : !run ? <EmptyState title="No MRP run yet" description={can("mrp:run") ? "Run MRP to plan from current stock, orders and forecasts." : "Ask a planner to run MRP."} />
                    : (
                      <dl className="divide-y divide-border">
                        {[
                          ["Last run", `${run.runNumber} · ${run.completedAt ? new Date(run.completedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}`],
                          ["Run by", run.triggeredBy],
                          ["Duration", fmtDuration(run.durationMs)],
                          ["Materials planned", String(run.materialsPlanned)],
                          ["Planned orders", `${run.plannedOrderCount} (${plannedToPlace} to place)`],
                          ["Open exceptions", String(openExceptions)],
                        ].map(([k, val]) => (
                          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                            <dt className="text-body-md text-muted-foreground">{k}</dt>
                            <dd className="text-right text-body-md font-medium tabular-nums text-foreground">{val}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
            </Section>
          )}

          {inv && (
            <Section
              title="Stock exhaustion alerts"
              description={alertsQ.data ? `${alertsQ.data.counts.total} running out within 14 days` : undefined}
              actions={<button onClick={() => router.push("/stock-alerts")} className="text-body-sm text-muted-foreground transition-colors hover:text-foreground">View all</button>}
            >
              {alertsQ.error ? <SectionError error={alertsQ.error} onRetry={() => void alertsQ.refetch()} />
                : alertsQ.isPending ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-5 w-full" />)}</div>
                  : alertsQ.data.alerts.length === 0 ? <EmptyState title="No alerts" description="Nothing is running out within 14 days at current usage." />
                    : (
                      <ul className="divide-y divide-border">
                        {alertsQ.data.alerts.slice(0, 7).map((a) => (
                          <li key={`${a.materialId}|${a.location.id}`} className="flex items-baseline justify-between gap-3 py-2">
                            <span className="min-w-0 truncate text-body-md text-foreground" title={`${a.name} — ${a.location.name}`}>{a.name}</span>
                            <span className={`shrink-0 text-body-sm tabular-nums ${a.level === "critical" ? "text-danger" : "text-muted-foreground"}`}>
                              {formatQty(a.stock)} {a.uom} · {a.coverDays}d
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
            </Section>
          )}

          {wos && (
            <Section title="Production schedule" description="Open work orders starting in the next 7 days"
              actions={<button onClick={() => router.push("/work-orders")} className="text-body-sm text-muted-foreground transition-colors hover:text-foreground">View all</button>}>
              {woQ.error ? <SectionError error={woQ.error} onRetry={() => void woQ.refetch()} />
                : <DataTable columns={scheduleColumns} rows={upcoming} rowKey={(r) => r.id} loading={woQ.isPending}
                    onRowClick={() => router.push("/work-orders")}
                    empty={<EmptyState title="Nothing scheduled" description="No open work order starts in the next 7 days." />} />}
            </Section>
          )}
        </div>
      )}

      {mrp && run && (
        <Section className="mt-8" title="Open MRP exceptions" description={`${openExceptions} unresolved in ${run.runNumber}`}
          actions={<button onClick={() => router.push("/mrp-run")} className="text-body-sm text-muted-foreground transition-colors hover:text-foreground">Resolve on MRP run</button>}>
          {excQ.error ? <SectionError error={excQ.error} onRetry={() => void excQ.refetch()} />
            : <DataTable columns={exceptionColumns} rows={exceptions} rowKey={(e) => e.id} name="Open MRP exceptions" loading={excQ.isPending} searchable exportable pageSize={10}
                empty={<EmptyState title="No open exceptions" description="The latest plan raised nothing that needs attention." />} />}
        </Section>
      )}

      <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
        {[
          { label: "Lot traceability", icon: Hash, to: "/batch-tracking", show: inv },
          { label: "Slow-moving stock", icon: Package, to: "/inventory-health", show: inv },
        ].filter((l) => l.show).map(({ label, icon: Icon, to }) => (
          <button key={to} onClick={() => router.push(to)} className={btnSecondary}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
