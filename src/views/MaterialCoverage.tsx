import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnLink, btnPrimary, btnSecondary } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { useSession } from "@/components/auth/session-context";
import { ApiError, apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";

/**
 * Material coverage from the latest MRP run: how many days current stock and
 * open supply last before falling below safety stock, and the date the next
 * order must be placed. Materials below two weeks of cover lead the chart.
 */

interface Row {
  material: { id: string; code: string; name: string; kind: string };
  category: string | null; uom: string; location: { id: string; code: string; name: string };
  procurementType: "BUY" | "MAKE" | null;
  openingStock: number; grossRequirement: number; scheduledReceipts: number; safetyStock: number;
  netRequirement: number; coverDays: number | null; horizonDays: number; nextPlannedRelease: string | null;
  status: "critical" | "short" | "covered" | "adequate";
}

const RISK = {
  critical: { status: "red", label: "Critical" },
  short: { status: "amber", label: "Needs order" },
  covered: { status: "green", label: "Covered" },
  adequate: { status: "gray", label: "No demand" },
} as const;
const CRITICAL_DAYS = 14;

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default function MaterialCoverage() {
  const { can } = useSession();
  const router = useRouter();
  const [withDemandOnly, setWithDemandOnly] = useState(true);

  const runQ = useQuery({
    queryKey: ["mrp", "run", "latest"],
    queryFn: async () => {
      try {
        return await apiGet<{ id: string; runNumber: string; asOfDate: string }>("/mrp/runs/latest");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const run = runQ.data ?? null;
  const rowsQ = useQuery({ queryKey: ["mrp", "materials", run?.id], queryFn: () => apiGet<Row[]>(`/mrp/runs/${run!.id}/materials`), enabled: !!run });
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const shown = withDemandOnly ? rows.filter((r) => r.status !== "adequate") : rows;

  // Lowest cover first; a material that holds all horizon sorts last.
  const coverOf = (r: Row) => r.coverDays ?? r.horizonDays;
  const chartData = useMemo(() => rows
    .filter((r) => r.status !== "adequate")
    .sort((a, b) => coverOf(a) - coverOf(b))
    .slice(0, 12)
    .map((r) => ({ name: r.material.code, label: `${r.material.name} — ${r.location.name}`, cover: coverOf(r), beyond: r.coverDays === null })), [rows]);

  const actionFor = (r: Row) => {
    if (!r.nextPlannedRelease) return null;
    return r.procurementType === "MAKE"
      ? { label: "Plan production", to: "/mrp-run" }
      : { label: "Plan purchase", to: "/purchase-planning" };
  };

  const columns: Column<Row>[] = [
    {
      key: "material", header: "Material", value: (r) => `${r.material.code} ${r.material.name}`,
      cell: (r) => <span><span className="identifier text-body-sm text-muted-foreground">{r.material.code}</span> <span className="font-medium">{r.material.name}</span></span>,
    },
    { key: "location", header: "Location", width: "w-[120px]", value: (r) => r.location.name, cell: (r) => <span className="text-muted-foreground">{r.location.name}</span> },
    { key: "type", header: "Source", width: "w-[80px]", value: (r) => r.procurementType ?? "", cell: (r) => (r.procurementType === "MAKE" ? "Make" : r.procurementType === "BUY" ? "Buy" : "—") },
    { key: "stock", header: "On hand", align: "right", numeric: true, width: "w-[120px]", value: (r) => r.openingStock, cell: (r) => `${formatQty(r.openingStock)} ${r.uom}` },
    { key: "demand", header: "Demand (horizon)", align: "right", numeric: true, width: "w-[140px]", value: (r) => r.grossRequirement, cell: (r) => formatQty(r.grossRequirement) },
    {
      key: "cover", header: "Cover", align: "right", numeric: true, width: "w-[90px]", value: coverOf,
      cell: (r) => r.coverDays === null
        ? <span className="text-muted-foreground">{r.horizonDays}d+</span>
        : <span className={r.coverDays < CRITICAL_DAYS ? "font-medium text-danger" : "font-medium"}>{r.coverDays}d</span>,
    },
    {
      key: "until", header: "Covered until", width: "w-[130px]", value: coverOf,
      cell: (r) => (run ? (r.coverDays === null ? <span className="text-muted-foreground">Beyond horizon</span> : fmtDate(addDays(run.asOfDate, r.coverDays))) : "—"),
    },
    { key: "orderBy", header: "Order by", width: "w-[130px]", value: (r) => r.nextPlannedRelease ?? "9999", cell: (r) => (r.nextPlannedRelease ? <span className="font-medium">{fmtDate(r.nextPlannedRelease)}</span> : <span className="text-muted-foreground">—</span>) },
    { key: "risk", header: "Risk", width: "w-[120px]", value: (r) => RISK[r.status].label, cell: (r) => <StatusBadge {...RISK[r.status]} /> },
    {
      key: "action", header: "", align: "right", width: "w-[130px]", sortable: false,
      cell: (r) => {
        const a = actionFor(r);
        return a ? <button className={btnLink} onClick={() => router.push(a.to)}>{a.label}</button> : null;
      },
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Material coverage monitor</span>
        </h1>
        <label className="flex items-center gap-1.5 text-body-sm whitespace-nowrap">
          <input type="checkbox" className="rounded" checked={withDemandOnly} onChange={() => setWithDemandOnly(!withDemandOnly)} /> Materials with demand only
        </label>
      </div>

      {runQ.error || rowsQ.error ? (
        <EmptyState title="Coverage could not be loaded" description={(runQ.error ?? rowsQ.error)!.message}
          action={<button className={btnSecondary} onClick={() => { void runQ.refetch(); void rowsQ.refetch(); }}>Try again</button>} />
      ) : !runQ.isPending && !run ? (
        <EmptyState title="No MRP run yet" description="Coverage is measured against the MRP plan; it appears once MRP has been run."
          action={can("mrp:run") ? <button className={btnPrimary} onClick={() => router.push("/mrp-run")}>Go to MRP run</button> : undefined} />
      ) : (
        <>
          {run && (
            <p className="text-body-sm text-muted-foreground">
              From <span className="identifier">{run.runNumber}</span>, planned as of {fmtDate(run.asOfDate)}. Cover is the days until stock and open supply, without new orders, fall below safety stock.
            </p>
          )}
          <div>
            <h3 className="text-body-md font-semibold mb-3">Lowest cover (days)</h3>
            {runQ.isPending || rowsQ.isPending ? (
              <SkeletonBlock className="h-[280px] w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState title="No demand in the plan" description="No material has requirements in the planning horizon." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} interval={0} />
                  <YAxis width={44} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }}
                    labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""}
                    formatter={(v: number, _n, p) => [`${v}${(p.payload as { beyond: boolean }).beyond ? "+" : ""} days`, "Cover"]}
                  />
                  <ReferenceLine y={CRITICAL_DAYS} stroke={CHART_COLORS.primary} strokeDasharray="5 5" label={{ value: `${CRITICAL_DAYS} days`, fontSize: 10, fill: CHART_COLORS.primary, position: "insideTopLeft" }} />
                  {/* A material with no cover left still gets a visible stub: it is the most urgent bar. */}
                  <Bar dataKey="cover" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} minPointSize={3} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(r) => `${r.material.id}|${r.location.id}`}
            name="Material coverage"
            loading={runQ.isPending || rowsQ.isPending}
            searchable
            columnToggle
            exportable
            pageSize={25}
            empty={<EmptyState title="Nothing to show" description="No material has demand in the planning horizon." />}
          />
        </>
      )}
    </div>
  );
}
