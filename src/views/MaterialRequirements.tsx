import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnSecondary, selectSm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { ApiError, apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";

/**
 * Material requirements from the latest MRP run: one row per material and
 * location, and the time-phased record (gross, receipts, projected on hand,
 * net, planned receipts and releases) for the one selected.
 */

interface Row {
  material: { id: string; code: string; name: string; kind: string };
  category: string | null; uom: string; location: { id: string; code: string; name: string };
  lowLevelCode: number; procurementType: "BUY" | "MAKE" | null;
  openingStock: number; grossRequirement: number; scheduledReceipts: number; safetyStock: number;
  netRequirement: number; plannedReceipts: number; coverDays: number | null; horizonDays: number;
  status: "critical" | "short" | "covered" | "adequate";
}
interface Bucket {
  bucketStart: string; bucketEnd: string; grossRequirement: number; scheduledReceipts: number; projectedOnHand: number;
  safetyStock: number; netRequirement: number; plannedReceipt: number; plannedRelease: number;
}

const STATUS = {
  critical: { status: "red", label: "Critical" },
  short: { status: "amber", label: "Needs orders" },
  covered: { status: "green", label: "Covered" },
  adequate: { status: "green", label: "No demand" },
} as const;

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function TimePhased({ runId, row }: { runId: string; row: Row }) {
  const q = useQuery({
    queryKey: ["mrp", "time-phased", runId, row.material.id, row.location.id],
    queryFn: () => apiGet<Bucket[]>(`/mrp/runs/${runId}/requirements`, { materialId: row.material.id, locationId: row.location.id }),
  });
  if (q.isPending) return <SkeletonBlock className="h-24 w-full" />;
  if (q.error) return <EmptyState title="Could not load the time-phased record" description={q.error.message} />;
  const lines: [string, keyof Bucket][] = [
    ["Gross requirement", "grossRequirement"], ["Scheduled receipts", "scheduledReceipts"], ["Planned receipts", "plannedReceipt"],
    ["Projected on hand", "projectedOnHand"], ["Net requirement", "netRequirement"], ["Planned releases", "plannedRelease"],
  ];
  return (
    <div className="surface-panel p-4">
      <h3 className="text-body-md font-semibold mb-2">
        <span className="identifier">{row.material.code}</span> {row.material.name} — {row.location.name}
        <span className="font-normal text-muted-foreground"> · safety stock {formatQty(row.safetyStock)} {row.uom}</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="data-table text-body-sm">
          <thead><tr className="border-b border-border">
            <th className="sticky left-0 bg-background px-2 py-1.5 text-left font-medium text-muted-foreground">{row.uom}</th>
            {q.data.map((b) => <th key={b.bucketStart} className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap">{fmtDate(b.bucketStart)}</th>)}
          </tr></thead>
          <tbody>
            {lines.map(([label, k]) => (
              <tr key={k} className="border-b border-border">
                <td className="sticky left-0 bg-background px-2 py-1.5 whitespace-nowrap text-muted-foreground">{label}</td>
                {q.data.map((b) => {
                  const v = b[k] as number;
                  const danger = k === "projectedOnHand" && v < b.safetyStock;
                  return <td key={b.bucketStart} className={`px-2 py-1.5 text-right tabular-nums ${danger ? "text-danger font-medium" : ""} ${v === 0 && k !== "projectedOnHand" ? "text-muted-foreground/50" : ""}`}>{formatQty(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MaterialRequirements() {
  const [category, setCategory] = useState("");
  const [locationId, setLocationId] = useState("");
  const [shortagesOnly, setShortagesOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const runQ = useQuery({
    queryKey: ["mrp", "run", "latest"],
    queryFn: async () => {
      try {
        return await apiGet<{ id: string; runNumber: string; asOfDate: string; completedAt: string | null }>("/mrp/runs/latest");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const run = runQ.data ?? null;
  const rowsQ = useQuery({ queryKey: ["mrp", "materials", run?.id], queryFn: () => apiGet<Row[]>(`/mrp/runs/${run!.id}/materials`), enabled: !!run });
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rows]);
  const locations = useMemo(() => [...new Map(rows.map((r) => [r.location.id, r.location])).values()], [rows]);
  const filtered = rows.filter((r) =>
    (!category || r.category === category) && (!locationId || r.location.id === locationId) &&
    (!shortagesOnly || r.status === "critical" || r.status === "short"));
  const key = (r: Row) => `${r.material.id}|${r.location.id}`;
  const selectedRow = rows.find((r) => key(r) === selected) ?? null;

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: "w-[96px]", value: (m) => m.material.code, cell: (m) => <span className="identifier text-body-sm">{m.material.code}</span> },
    { key: "name", header: "Material", value: (m) => m.material.name, cell: (m) => <span className="font-medium">{m.material.name}</span> },
    { key: "level", header: "Level", align: "right", numeric: true, width: "w-[70px]", value: (m) => m.lowLevelCode, cell: (m) => m.lowLevelCode },
    { key: "location", header: "Location", width: "w-[120px]", value: (m) => m.location.name, cell: (m) => <span className="text-muted-foreground">{m.location.name}</span> },
    { key: "opening", header: "Opening stock", align: "right", numeric: true, width: "w-[130px]", value: (m) => m.openingStock, cell: (m) => `${formatQty(m.openingStock)} ${m.uom}` },
    { key: "gross", header: "Gross req.", align: "right", numeric: true, width: "w-[120px]", value: (m) => m.grossRequirement, cell: (m) => formatQty(m.grossRequirement) },
    { key: "scheduled", header: "Scheduled receipts", align: "right", numeric: true, width: "w-[150px]", value: (m) => m.scheduledReceipts, cell: (m) => formatQty(m.scheduledReceipts) },
    { key: "safety", header: "Safety stock", align: "right", numeric: true, width: "w-[115px]", value: (m) => m.safetyStock, cell: (m) => formatQty(m.safetyStock) },
    { key: "net", header: "Net req.", align: "right", numeric: true, width: "w-[110px]", value: (m) => m.netRequirement, cell: (m) => <span className="font-medium">{formatQty(m.netRequirement)}</span> },
    { key: "planned", header: "Planned receipts", align: "right", numeric: true, width: "w-[140px]", value: (m) => m.plannedReceipts, cell: (m) => formatQty(m.plannedReceipts) },
    {
      key: "cover", header: "Cover", align: "right", numeric: true, width: "w-[90px]", value: (m) => m.coverDays ?? m.horizonDays + 1,
      cell: (m) => (m.coverDays === null ? <span className="text-muted-foreground">{m.horizonDays}d+</span> : `${m.coverDays}d`),
    },
    { key: "status", header: "Status", width: "w-[130px]", value: (m) => STATUS[m.status].label, cell: (m) => <StatusBadge {...STATUS[m.status]} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Material requirements</span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <select className={selectSm} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={selectSm} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
            <option value="">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-body-sm whitespace-nowrap">
            <input type="checkbox" checked={shortagesOnly} onChange={() => setShortagesOnly(!shortagesOnly)} className="rounded" /> Needs action only
          </label>
        </div>
      </div>

      {runQ.error || rowsQ.error ? (
        <EmptyState title="Requirements could not be loaded" description={(runQ.error ?? rowsQ.error)!.message}
          action={<button className={btnSecondary} onClick={() => { void runQ.refetch(); void rowsQ.refetch(); }}>Try again</button>} />
      ) : !runQ.isPending && !run ? (
        <EmptyState title="No MRP run yet" description="Requirements appear here after MRP has been run." />
      ) : (
        <>
          {run && (
            <p className="text-body-sm text-muted-foreground">
              From <span className="identifier">{run.runNumber}</span>, planned as of {fmtDate(run.asOfDate)}. Net requirement is what must be newly supplied over the horizon; cover is days until stock without new orders falls below safety stock. Click a row for its time-phased record.
            </p>
          )}
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={key}
            name="Material requirements"
            loading={runQ.isPending || rowsQ.isPending}
            searchable
            columnToggle
            exportable
            pageSize={25}
            onRowClick={(r) => setSelected(key(r))}
            isRowSelected={(r) => key(r) === selected}
            empty={<EmptyState title="Nothing matches" description="No material fits these filters." />}
          />
          {run && selectedRow && <TimePhased runId={run.id} row={selectedRow} />}
        </>
      )}
    </div>
  );
}
