import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnSecondary } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import { NewWorkOrderButton, WorkOrderActions } from "@/components/production/wo-actions";
import type { WorkOrderDetail, WorkOrderList, WorkOrderRow, WorkOrderStatus } from "@/server/production/work-orders";

type TabKey = "all" | "overdue" | WorkOrderStatus;

const tabsConfig: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "PLANNED", label: "Planned" },
  { key: "FIRMED", label: "Firmed" },
  { key: "RELEASED", label: "Released" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CLOSED", label: "Closed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "overdue", label: "Overdue" },
];

const statusBadge: Record<WorkOrderStatus, { status: "green" | "amber" | "blue" | "gray"; label: string }> = {
  PLANNED: { status: "gray", label: "Planned" },
  FIRMED: { status: "blue", label: "Firmed" },
  RELEASED: { status: "blue", label: "Released" },
  IN_PROGRESS: { status: "amber", label: "In Progress" },
  COMPLETED: { status: "green", label: "Completed" },
  CLOSED: { status: "green", label: "Closed" },
  CANCELLED: { status: "gray", label: "Cancelled" },
};

const opBadge: Record<WorkOrderDetail["operations"][number]["status"], { status: "green" | "amber" | "gray"; label: string }> = {
  PENDING: { status: "gray", label: "Pending" },
  IN_PROGRESS: { status: "amber", label: "In progress" },
  COMPLETED: { status: "green", label: "Completed" },
  SKIPPED: { status: "gray", label: "Skipped" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function TraceBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 95 ? "bg-success" : pct >= 80 ? "bg-warning" : "bg-danger"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-body-sm tabular-nums">{pct}%</span>
    </div>
  );
}

function WorkOrderPanel({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["work-order", id],
    queryFn: ({ signal }) => apiGet<WorkOrderDetail>(`/work-orders/${id}`, undefined, { signal }),
  });

  if (q.isPending) {
    return (
      <div className="surface-panel p-4 space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="surface-panel">
        <EmptyState title="Work order could not be loaded" description={q.error.message}
          action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      </div>
    );
  }

  const wo = q.data;
  const withLot = wo.components.filter((c) => c.lot).length;

  return (
    <div className="surface-panel p-4 space-y-4">
      <h3 className="text-body-md font-semibold flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-mbom" /> Work order detail — {wo.orderNumber}
      </h3>
      <WorkOrderActions wo={wo} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">Product</span><span className="font-medium">{wo.product.name}</span> <span className="identifier text-muted-foreground">{wo.product.code}</span></div>
        <div><span className="text-muted-foreground block">Location</span><span className="font-medium">{wo.location.name}</span></div>
        <div><span className="text-muted-foreground block">Planned</span><span className="font-medium">{fmtDate(wo.plannedStartDate)} → {fmtDate(wo.plannedEndDate)}</span></div>
        <div><span className="text-muted-foreground block">Actual</span><span className="font-medium">{wo.actualStartDate || wo.actualEndDate ? `${fmtDate(wo.actualStartDate)} → ${fmtDate(wo.actualEndDate)}` : "Not recorded"}</span></div>
        <div><span className="text-muted-foreground block">Quantity</span><span className="font-medium tabular-nums">{formatQty(wo.producedQty)} of {formatQty(wo.plannedQty)} {wo.uom}{wo.scrappedQty > 0 ? ` · ${formatQty(wo.scrappedQty)} scrapped` : ""}</span></div>
        <div><span className="text-muted-foreground block">BOM</span><span className="identifier font-medium">{wo.bom ? `${wo.bom.code} rev ${wo.bom.version}` : "—"}</span></div>
        <div><span className="text-muted-foreground block">Status</span>
          <span className="inline-flex gap-1"><StatusBadge {...statusBadge[wo.status]} />{wo.overdue && <StatusBadge status="red" label="Overdue" />}</span>
        </div>
        <div><span className="text-muted-foreground block">Output lots</span>
          <span className="identifier font-medium">{wo.outputLots.length ? wo.outputLots.map((l) => `${l.lotNumber} (${formatQty(l.quantity)})`).join(", ") : "None recorded"}</span>
        </div>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Operations</span>
        <div className="mt-1 space-y-1">
          {wo.operations.length ? wo.operations.map((op) => (
            <div key={op.sequence} className="flex items-center gap-2 text-body-sm px-2 py-1 rounded bg-secondary/50">
              <span className="identifier text-muted-foreground">{op.sequence}</span>
              <span className="font-medium">{op.name}</span>
              <span className="identifier">{op.workCentre ?? "—"}</span>
              <span className="text-muted-foreground tabular-nums">{formatQty(op.setupMinutes)} + {formatQty(op.runMinutes)} min</span>
              <span className="ml-auto"><StatusBadge {...opBadge[op.status]} /></span>
            </div>
          )) : <div className="text-body-sm text-muted-foreground">No operations recorded</div>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-body-sm text-muted-foreground font-medium">Components</span>
          {wo.shortComponents !== null && (
            <span className={`text-body-sm ${wo.shortComponents > 0 ? "text-danger font-semibold" : "text-muted-foreground"}`}>
              {wo.shortComponents > 0 ? `⚠ ${wo.shortComponents} short at ${wo.location.name}` : `All available at ${wo.location.name}`}
            </span>
          )}
        </div>
        <div className="mt-1 space-y-1">
          {wo.components.map((c) => {
            const short = c.readiness?.status === "short";
            const suspect = c.lot && (c.lot.qcStatus === "QUARANTINE" || c.lot.qcStatus === "REJECTED");
            return (
              <div key={c.material.id} className={`flex items-center gap-2 text-body-sm px-2 py-1 rounded ${short || suspect ? "bg-danger/10 border border-danger/20" : "bg-secondary/50"}`}>
                <span className="identifier text-foreground">{c.material.code}</span>
                <span className="font-medium truncate">{c.material.name}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">{formatQty(c.issuedQty)} / {formatQty(c.requiredQty)} {c.uom} issued</span>
                {c.lot
                  ? <span className="identifier">{c.lot.lotNumber}</span>
                  : <span className="text-muted-foreground italic">No lot recorded</span>}
                <span className="ml-auto whitespace-nowrap tabular-nums">
                  {c.readiness === null ? null
                    : c.readiness.status === "issued" ? <span className="text-success">Fully issued</span>
                      : c.readiness.status === "available" ? <span className="text-muted-foreground">{formatQty(c.readiness.onHand)} on hand</span>
                        : <span className="text-danger font-semibold">⚠ short {formatQty(c.readiness.shortfall)} ({formatQty(c.readiness.onHand)} on hand)</span>}
                  {suspect && <span className="text-danger font-semibold ml-2">⚠ SUSPECT</span>}
                </span>
              </div>
            );
          })}
          {wo.components.length === 0 && <div className="text-body-sm text-muted-foreground">No components recorded</div>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-body-sm mb-1">
          <span className="text-muted-foreground">Trace completeness</span>
          <span className="font-semibold tabular-nums">
            {wo.traceComplete === null ? "Not started — nothing to trace yet" : `${withLot}/${wo.components.length} components with a lot recorded`}
          </span>
        </div>
        {wo.traceComplete !== null && (
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-mbom rounded-full" style={{ width: `${wo.traceComplete}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkOrders() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [detailWO, setDetailWO] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["work-orders"],
    queryFn: ({ signal }) => apiGet<WorkOrderList>("/work-orders", undefined, { signal }),
  });

  const orders = q.data?.orders ?? [];
  const filtered = activeTab === "all" ? orders
    : activeTab === "overdue" ? orders.filter((o) => o.overdue)
      : orders.filter((o) => o.status === activeTab);

  const columns: Column<WorkOrderRow>[] = [
    { key: "wo", header: "Work order", width: "w-[130px]", value: w => w.orderNumber, cell: w => <span className="identifier text-body-sm text-foreground">{w.orderNumber}</span> },
    { key: "product", header: "Product", value: w => w.product.name, cell: w => <span className="font-medium">{w.product.name}</span> },
    { key: "ordered", header: "Ordered", align: "right", numeric: true, width: "w-[96px]", value: w => w.plannedQty, cell: w => formatQty(w.plannedQty) },
    { key: "produced", header: "Produced", align: "right", numeric: true, width: "w-[100px]", value: w => w.producedQty, cell: w => formatQty(w.producedQty) },
    { key: "bom", header: "BOM", width: "w-[130px]", value: w => (w.bom ? `${w.bom.code} ${w.bom.version}` : ""), cell: w => <span className="text-muted-foreground">{w.bom ? `${w.bom.code} · ${w.bom.version}` : "—"}</span> },
    { key: "scheduled", header: "Scheduled", width: "w-[120px]", value: w => w.plannedStartDate, cell: w => fmtDate(w.plannedStartDate) },
    {
      key: "due", header: "Due", width: "w-[170px]", value: w => w.plannedEndDate,
      cell: w => w.overdue
        ? <span className="text-danger font-medium whitespace-nowrap" title="Past due and still open">{fmtDate(w.plannedEndDate)} <span className="text-caption">(overdue)</span></span>
        : <span className="whitespace-nowrap">{fmtDate(w.plannedEndDate)}</span>,
    },
    { key: "line", header: "Line", width: "w-[190px]", value: w => w.workCentres.join(" "), cell: w => <span className="identifier text-body-sm">{w.workCentres.length ? w.workCentres.join(" → ") : "—"}</span> },
    {
      key: "traceComplete", header: "Trace %", width: "w-[130px]",
      value: w => w.traceComplete ?? -1,
      cell: w => w.traceComplete !== null ? <TraceBar pct={w.traceComplete} /> : <span className="text-muted-foreground" title="Production has not started">—</span>,
    },
    { key: "status", header: "Status", width: "w-[120px]", value: w => statusBadge[w.status].label, cell: w => <StatusBadge {...statusBadge[w.status]} /> },
  ];

  const getCount = (key: TabKey) => (q.data ? q.data.counts[key] : "—");

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Work orders</span>
        </h1>
        <NewWorkOrderButton onCreated={setDetailWO} />
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabsConfig.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-body-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{t.label} ({getCount(t.key)})</button>
        ))}
      </div>

      <div>
        {q.error ? (
          <div className="surface-panel">
            <EmptyState title="Work orders could not be loaded" description={q.error.message}
              action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={w => w.id}
            name="Work orders"
            loading={q.isPending}
            empty={<EmptyState
              title={activeTab === "all" ? "No work orders yet" : "No work orders in this view"}
              description={activeTab === "all" ? "Work orders appear here once production is planned." : "Try another tab."} />}
            searchable
            columnToggle
            exportable
            pageSize={25}
            onRowClick={w => setDetailWO(w.id)}
            isRowSelected={w => w.id === detailWO}
          />
        )}
      </div>

      {detailWO && <WorkOrderPanel key={detailWO} id={detailWO} />}
    </div>
  );
}
