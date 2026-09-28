"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { btnSecondary, btnSecondarySm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import type { ExhaustionAlert, ExhaustionAlerts, AlertLevel } from "@/server/inventory/exhaustion";

const levelBadge: Record<AlertLevel, { status: "red" | "amber"; label: string }> = {
  critical: { status: "red", label: "Critical" },
  high: { status: "amber", label: "High" },
  medium: { status: "amber", label: "Medium" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function StockExhaustionAlerts() {
  const router = useRouter();

  const q = useQuery({
    queryKey: ["inventory", "exhaustion-alerts"],
    queryFn: ({ signal }) => apiGet<ExhaustionAlerts>("/inventory/exhaustion-alerts", undefined, { signal }),
  });

  const data = q.data;
  const alerts = data?.alerts ?? [];
  const t = data?.thresholds ?? { critical: 3, high: 7, medium: 14 };

  const columns: Column<ExhaustionAlert>[] = [
    { key: "level", header: "Level", width: "w-[110px]", value: a => levelBadge[a.level].label, cell: a => <StatusBadge {...levelBadge[a.level]} /> },
    { key: "material", header: "Material", value: a => a.name, cell: a => <span className="font-medium">{a.name}</span> },
    { key: "warehouse", header: "Warehouse", width: "w-[120px]", value: a => a.location.name, cell: a => <span className="text-muted-foreground">{a.location.name}</span> },
    { key: "stock", header: "Current stock", align: "right", numeric: true, width: "w-[130px]", value: a => a.stock, cell: a => `${formatQty(a.stock)} ${a.uom}` },
    { key: "daily", header: "Daily use", align: "right", numeric: true, width: "w-[110px]", value: a => a.dailyUse, cell: a => `${formatQty(a.dailyUse)} ${a.uom}/d` },
    { key: "days", header: "Days cover", align: "right", numeric: true, width: "w-[115px]", value: a => a.coverDays, cell: a => <span className="font-medium">{a.coverDays}d</span> },
    { key: "reqBy", header: "Required by", width: "w-[125px]", value: a => a.requiredBy, cell: a => fmtDate(a.requiredBy) },
    {
      key: "reorderBy", header: "Reorder by", width: "w-[125px]",
      value: a => (a.reorderImmediate ? "0000" : a.reorderBy ?? "9999"),
      cell: a => a.reorderImmediate
        ? <span className="font-medium text-danger">Immediate</span>
        : a.reorderBy
          ? <span className="font-medium">{fmtDate(a.reorderBy)}</span>
          : <span className="text-muted-foreground" title="No lead time on record">—</span>,
    },
    {
      key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[95px]",
      value: a => a.leadTimeDays ?? -1,
      cell: a => a.leadTimeDays === null
        ? <span className="text-muted-foreground" title="No vendor lead time on record">—</span>
        : <span title={a.leadTimeSource === "PRODUCTION" ? "Production lead time" : "Vendor lead time"}>{a.leadTimeDays}</span>,
    },
    {
      key: "vendor", header: "Vendor", value: a => a.vendor?.name ?? "",
      cell: a => a.vendor
        ? a.vendor.name
        : <span className="text-muted-foreground">{a.procurementType === "MAKE" ? "Made in-house" : "—"}</span>,
    },
    {
      key: "action", header: "Action", width: "w-[110px]", sortable: false,
      cell: a => a.procurementType === "MAKE" ? (
        <button onClick={() => router.push("/work-orders")} className={btnSecondarySm}>Plan WO</button>
      ) : (
        <button onClick={() => router.push("/purchase-orders")} className={btnSecondarySm}>Raise PO</button>
      ),
    },
  ];

  const cards = [
    { label: `Critical (< ${t.critical} days)`, count: data?.counts.critical, icon: "alert-critical", color: "bg-danger/10 text-danger border-danger/20" },
    { label: `High (${t.critical}–${t.high} days)`, count: data?.counts.high, icon: "alert-high", color: "bg-warning/10 text-warning border-warning/20" },
    { label: `Medium (${t.high}–${t.medium} days)`, count: data?.counts.medium, icon: "alert-medium", color: "bg-warning/10 text-warning border-warning/20" },
    { label: "Total active alerts", count: data?.counts.total, icon: "alert-total", color: "bg-secondary text-foreground border-border" },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Stock exhaustion alerts</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
            {/* The icon is pulled out beside the figure and the label rather
                than stacked above them, so the card keeps the height it had
                and the number stays the first thing read. */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-display-xl leading-none tabular-nums">{s.count ?? "—"}</div>
                <div className="text-body-sm mt-0.5">{s.label}</div>
              </div>
              <img
                src={`/icons/alerts/${s.icon}.png`}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="block h-6 w-6 shrink-0 object-contain"
              />
            </div>
          </div>
        ))}
      </div>

      {q.error ? (
        <div className="surface-panel">
          <EmptyState title="Alerts could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          {data && (
            <p className="mb-2 text-body-sm text-muted-foreground">
              Projected from current stock at each location's average daily demand; open purchase and work orders are not netted.
              {data.notAssessed > 0 && ` ${data.notAssessed} stocked material-location${data.notAssessed === 1 ? " has" : "s have"} no demand figure and ${data.notAssessed === 1 ? "isn't" : "aren't"} assessed.`}
            </p>
          )}
          <DataTable
            columns={columns}
            rows={alerts}
            rowKey={a => `${a.materialId}-${a.location.id}`}
            name="Stock exhaustion alerts"
            loading={q.isPending}
            empty={<EmptyState title="No exhaustion alerts" description={`Every assessed material has more than ${t.medium} days of cover.`} />}
            searchable
            columnToggle
            exportable
            pageSize={25}
          />
        </div>
      )}
    </div>
  );
}
