import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { btnSecondary } from "@/components/app/controls";
import KPICard from "@/components/KPICard";
import { Shield, AlertTriangle, Info } from "lucide-react";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import type { SafetyStockRow, SafetyStockView, UnavailableReason } from "@/server/inventory/safety-stock";

const unavailableText: Record<UnavailableReason, string> = {
  NO_STD_DEV: "No demand standard deviation on the policy",
  NO_SERVICE_LEVEL: "No service level on the policy",
  NO_LEAD_TIME: "No lead time — no single vendor to buy from",
};

const dash = <span className="text-muted-foreground">—</span>;

export default function SafetyStock() {
  const q = useQuery({
    queryKey: ["inventory", "safety-stock"],
    queryFn: ({ signal }) => apiGet<SafetyStockView>("/inventory/safety-stock", undefined, { signal }),
  });

  const rows = q.data?.rows ?? [];
  const summary = q.data?.summary;

  const columns: Column<SafetyStockRow>[] = [
    { key: "material", header: "Material", value: d => d.name, cell: d => <span className="font-medium">{d.name}</span> },
    { key: "cat", header: "Category", width: "w-[110px]", value: d => d.category ?? "", cell: d => <span className="text-muted-foreground">{d.category ?? "—"}</span> },
    { key: "location", header: "Location", width: "w-[120px]", value: d => d.location.name, cell: d => <span className="text-muted-foreground">{d.location.name}</span> },
    {
      key: "avgDaily", header: "Avg. daily", align: "right", numeric: true, width: "w-[110px]", value: d => d.averageDailyDemand ?? -1,
      cell: d => (d.averageDailyDemand === null ? dash : `${formatQty(d.averageDailyDemand)} ${d.uom}/d`),
    },
    {
      key: "stdDev", header: "Std dev", align: "right", numeric: true, width: "w-[100px]", value: d => d.demandStdDev ?? -1,
      cell: d => (d.demandStdDev === null ? dash : `${formatQty(d.demandStdDev)} ${d.uom}`),
    },
    {
      key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[95px]", value: d => d.leadTimeDays ?? -1,
      cell: d => d.leadTimeDays === null ? dash : (
        <span title={d.leadTimeSource === "PRODUCTION" ? "Production lead time (made in-house)" : `Vendor lead time${d.vendor ? ` — ${d.vendor.name}` : ""}`}>{d.leadTimeDays}</span>
      ),
    },
    {
      key: "variability", header: "Variability", width: "w-[120px]", value: d => d.variability ?? "",
      cell: d => d.variability
        ? <StatusBadge status={d.variability === "High" ? "red" : d.variability === "Medium" ? "amber" : "green"} label={d.variability} />
        : dash,
    },
    { key: "current", header: "Current SS", align: "right", numeric: true, width: "w-[115px]", value: d => d.current, cell: d => `${formatQty(d.current)} ${d.uom}` },
    {
      key: "recommended", header: "Recommended", align: "right", numeric: true, width: "w-[135px]", value: d => d.recommended ?? -1,
      cell: d => d.recommended === null
        ? <span className="text-muted-foreground" title={d.unavailableReason ? unavailableText[d.unavailableReason] : undefined}>Not calculated</span>
        : <span className="font-medium" title={`Z ${d.z} (${Math.round((d.serviceLevel ?? 0) * 1000) / 10}% service) × ${formatQty(d.demandStdDev ?? 0)} × √${d.leadTimeDays}`}>{formatQty(d.recommended)} {d.uom}</span>,
    },
    {
      key: "gap", header: "Gap", align: "right", numeric: true, width: "w-[90px]", value: d => d.gap ?? Number.POSITIVE_INFINITY,
      cell: d => d.gap === null ? dash : (
        <span className={`font-medium ${d.gap < 0 ? "text-danger" : "text-success"}`}>
          {d.gap > 0 ? "+" : ""}{formatQty(d.gap)}
        </span>
      ),
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Safety stock management</span>
        </h1>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="Materials with safety stock" value={summary ? summary.withSafetyStock : "—"}
          subtitle={summary && summary.underRecommended > 0 ? `${summary.underRecommended} below recommended` : undefined} icon={Shield} />
        <KPICard title="Below safety stock now" value={summary ? summary.belowSafetyStock : "—"}
          status={summary?.belowSafetyStock ? "red" : undefined} icon={AlertTriangle} />
        <KPICard title="No buffer defined" value={summary ? summary.noBuffer : "—"}
          subtitle={summary ? "Zero safety stock, or stock held with no policy" : undefined}
          status={summary?.noBuffer ? "amber" : undefined} icon={Info} />
      </div>

      {q.error ? (
        <div className="surface-panel">
          <EmptyState title="Safety stock could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          {q.data && (
            <p className="mb-2 text-body-sm text-muted-foreground">
              Recommended = Z (from the policy's service level) × daily demand std dev × √lead time, rounded up.
              Lead time is the preferred vendor's for bought materials and the production lead time for made ones, plus any safety lead time.
              {summary && summary.unavailable > 0 && ` ${summary.unavailable} ${summary.unavailable === 1 ? "policy lacks" : "policies lack"} an input and ${summary.unavailable === 1 ? "isn't" : "aren't"} calculated.`}
            </p>
          )}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={d => `${d.materialId}-${d.location.id}`}
            name="Safety stock"
            loading={q.isPending}
            empty={<EmptyState title="No planning policies yet" description="Safety stock appears here once materials have a planning policy at a location." />}
            searchable
            columnToggle
            exportable
          />
        </div>
      )}
    </div>
  );
}
