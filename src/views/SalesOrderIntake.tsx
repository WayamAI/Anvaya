import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { MetricRow, type Metric } from "@/components/app/metric-row";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnSecondary } from "@/components/app/controls";
import { apiGet } from "@/lib/api";
import { LoadMore } from "@/components/app/load-more";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";

import { formatQty, inrCompact } from "@/lib/format";
import { NewSalesOrderButton, SalesOrderActions } from "@/components/sales/so-actions";
import type {
  CustomerType, DeliveryStatus, SalesOrderDetail, SalesOrderList, SalesOrderRow, SoStatus,
} from "@/server/sales/sales-orders";

type TabKey = "all" | "overdue" | SoStatus;
type Badge = { status: "green" | "amber" | "red" | "blue" | "gray"; label: string };

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "overdue", label: "Overdue" },
];

const statusMap: Record<SoStatus, Badge> = {
  CONFIRMED: { status: "blue", label: "Confirmed" },
  PROCESSING: { status: "amber", label: "Processing" },
  DISPATCHED: { status: "blue", label: "Dispatched" },
  DELIVERED: { status: "green", label: "Delivered" },
  CANCELLED: { status: "red", label: "Cancelled" },
};

const deliveryMap: Record<DeliveryStatus, Badge> = {
  PENDING: { status: "gray", label: "Pending" },
  IN_TRANSIT: { status: "amber", label: "In transit" },
  DELIVERED: { status: "green", label: "Delivered" },
};

const customerType: Record<CustomerType, string> = {
  DISTRIBUTOR: "Distributor",
  MODERN_TRADE: "Modern trade",
  ECOMMERCE: "E-commerce",
  INSTITUTIONAL: "Institutional",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const orders = (n: number) => `${n} order${n === 1 ? "" : "s"}`;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground block">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function SalesOrderPanel({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["sales-order", id],
    queryFn: ({ signal }) => apiGet<SalesOrderDetail>(`/sales-orders/${id}`, undefined, { signal }),
  });

  if (q.isPending) {
    return (
      <div className="surface-panel mt-4 p-4 space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="surface-panel mt-4">
        <EmptyState title="Sales order could not be loaded" description={q.error.message}
          action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      </div>
    );
  }

  const so = q.data;
  return (
    <div className="surface-panel mt-4 p-4 space-y-4">
      <h3 className="text-body-md font-semibold flex items-center gap-2 flex-wrap">
        Sales order — <span className="identifier">{so.orderNumber}</span>
        <StatusBadge {...statusMap[so.status]} />
        {so.overdue && <StatusBadge status="red" label="Overdue" />}
      </h3>

      <SalesOrderActions so={so} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-body-sm">
        <Fact label="Customer">
          {so.customer.name} <span className="identifier text-muted-foreground">{so.customer.code}</span>
        </Fact>
        <Fact label="Channel">{customerType[so.customer.type]}</Fact>
        <Fact label="Ordered">{fmtDate(so.orderDate)}</Fact>
        <Fact label="Required">
          <span className={so.overdue ? "text-danger" : ""}>{fmtDate(so.requiredDate)}</span>
        </Fact>
        <Fact label="Delivery"><StatusBadge {...deliveryMap[so.deliveryStatus]} /></Fact>
        <Fact label="Dispatched">
          {so.dispatchDate ? fmtDate(so.dispatchDate) : <span className="text-muted-foreground font-normal">Not recorded</span>}
        </Fact>
        <Fact label="Invoice">
          {so.invoiceNumber ? <span className="identifier">{so.invoiceNumber}</span> : <span className="text-muted-foreground font-normal">Not invoiced</span>}
        </Fact>
        <Fact label="Value">
          {rupees(so.totalAmount)} {so.currencyCode !== "INR" && so.currencyCode}
          {so.totalMismatch && <span className="text-danger font-normal"> · differs from its lines</span>}
        </Fact>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Lines</span>
        <div className="mt-1 overflow-x-auto">
          <table className="data-table w-full text-body-sm">
            <thead><tr className="border-b border-border">
              {["#", "Material", "Ordered", "Shipped", "Open", "Unit price", "Line total", "Required", "Shipped from"].map((h) =>
                <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {so.lines.map((l) => (
                <tr key={l.lineNumber} className="border-b border-border">
                  <td className="px-2 py-1.5 tabular-nums">{l.lineNumber}</td>
                  <td className="px-2 py-1.5"><span className="identifier text-muted-foreground">{l.material.code}</span> <span className="font-medium">{l.material.name}</span></td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.quantity)} {l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.shippedQty)} {l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.openQty > 0 ? `${formatQty(l.openQty)} ${l.uom}` : "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{rupees(l.unitPrice)}/{l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{rupees(l.lineTotal)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={l.overdue ? "text-danger font-medium" : ""}>{fmtDate(l.requiredDate)}</span>
                    {l.overdue && <span className="text-caption text-danger"> (overdue)</span>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {l.lots.length
                      ? l.lots.map((lot) => <span key={lot.id} className="identifier block">{lot.lotNumber} <span className="text-muted-foreground">({formatQty(lot.quantity)})</span></span>)
                      : <span className="text-muted-foreground">{l.shippedQty > 0 ? "No lot recorded" : "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Supply for open lines</span>
        <p className="text-caption text-muted-foreground">
          Stock and open work orders for each material at the line's location. Work orders are not linked to a sales order, so this is supply for the material, not production reserved for this order.
        </p>
        <div className="mt-1 space-y-1">
          {so.lines.filter((l) => l.openQty > 0).length === 0
            ? <div className="text-body-sm text-muted-foreground">Nothing left to ship</div>
            : so.lines.filter((l) => l.openQty > 0).map((l) => (
              <div key={l.lineNumber} className="text-body-sm px-2 py-1.5 rounded bg-secondary/50">
                <span className="identifier text-foreground">{l.material.code}</span>
                <span className="text-muted-foreground"> · {l.location.name} · open {formatQty(l.openQty)} {l.uom}</span>
                <span className="block text-muted-foreground">
                  {l.stock
                    ? <>Available <span className={`tabular-nums font-medium ${l.stock.available >= l.openQty ? "text-success" : "text-warning"}`}>{formatQty(l.stock.available)} {l.uom}</span> of {formatQty(l.stock.onHand)} on hand
                        {l.stock.reserved > 0 && ` · ${formatQty(l.stock.reserved)} reserved`}
                        {l.stock.quarantine > 0 && ` · ${formatQty(l.stock.quarantine)} in quarantine`}</>
                    : "No stock balance recorded at this location"}
                </span>
                <span className="block text-muted-foreground">
                  {l.openWorkOrders.length
                    ? l.openWorkOrders.map((w) => (
                        <span key={w.id} className="block">
                          <span className="identifier">{w.orderNumber}</span> · {w.status.replace(/_/g, " ").toLowerCase()} · {formatQty(w.plannedQty - w.producedQty)} {l.uom} to make · due {fmtDate(w.plannedEndDate)}
                        </span>
                      ))
                    : "No open work orders for this material"}
                </span>
              </div>
            ))}
        </div>
      </div>

      {so.notes && <p className="text-body-sm text-muted-foreground whitespace-pre-line">Notes: {so.notes}</p>}
    </div>
  );
}

export default function SalesOrderIntake() {
  const [tab, setTab] = useState<TabKey>("all");
  const [selected, setSelected] = useState<string | null>(null);

  // Paged on the server: the tab and search filter there; counts and KPIs cover the company.
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const q = usePagedQuery<SalesOrderList>(["sales-orders"], "/sales-orders", { status: tab === "all" ? undefined : tab, q: term || undefined });
  const list = q.data?.pages[0]?.data;
  const total = q.data?.pages[0]?.meta?.total;
  const filtered = useMemo(() => q.data?.pages.flatMap((p) => p.data.orders) ?? [], [q.data]);

  const columns: Column<SalesOrderRow>[] = [
    { key: "so", header: "SO number", width: "w-[130px]", value: o => o.orderNumber, cell: o => <span className="identifier text-body-sm text-foreground">{o.orderNumber}</span> },
    {
      key: "customer", header: "Customer", value: o => o.customer.name,
      cell: o => <><span className="font-medium">{o.customer.name}</span> <span className="text-caption text-muted-foreground">{customerType[o.customer.type]}</span></>,
    },
    { key: "date", header: "Order date", width: "w-[125px]", value: o => o.orderDate, cell: o => fmtDate(o.orderDate) },
    { key: "items", header: "Items", align: "right", numeric: true, width: "w-[70px]", value: o => o.lineCount, cell: o => o.lineCount },
    { key: "value", header: "Value", align: "right", numeric: true, width: "w-[100px]", value: o => o.totalAmount, cell: o => inrCompact(o.totalAmount) },
    {
      key: "required", header: "Required date", width: "w-[165px]", value: o => o.requiredDate,
      cell: o => o.overdue
        ? <span className="text-danger font-medium whitespace-nowrap" title="Awaiting dispatch, past its required date, with quantity still to ship">{fmtDate(o.requiredDate)} <span className="text-caption">(overdue)</span></span>
        : <span className="whitespace-nowrap">{fmtDate(o.requiredDate)}</span>,
    },
    {
      key: "delivery", header: "Delivery", width: "w-[115px]", value: o => deliveryMap[o.deliveryStatus].label,
      cell: o => <StatusBadge {...deliveryMap[o.deliveryStatus]} />,
    },
    {
      key: "status", header: "Status", width: "w-[125px]", value: o => statusMap[o.status].label,
      cell: o => <StatusBadge {...statusMap[o.status]} />,
    },
  ];

  const k = list?.kpis;
  const metrics: Metric[] = [
    { label: "Open orders", value: k ? k.open.count : "—", hint: k ? `${inrCompact(k.open.value)} not yet delivered` : undefined },
    {
      label: "Due in next 7 days", value: k ? k.dueNext7Days.count : "—",
      hint: k ? (list!.counts.overdue ? `${inrCompact(k.dueNext7Days.value)} · ${orders(list!.counts.overdue)} overdue` : inrCompact(k.dueNext7Days.value)) : undefined,
      tone: list?.counts.overdue ? "danger" : "default",
    },
    { label: "Booked today", value: k ? k.bookedToday.count : "—", hint: k ? inrCompact(k.bookedToday.value) : undefined },
    { label: "Dispatched this month", value: k ? inrCompact(k.dispatchedMtd) : "—", hint: k ? "From the stock ledger" : undefined },
  ];

  const count = (key: TabKey) => (list ? list.counts[key] : "—");
  const asOf = list ? fmtDate(list.asOf) : null;

  return (
    <div className="px-6 py-5">
      <PageHeader title="Sales order intake"
        description={list && total !== undefined ? `${orders(total)} · as of ${asOf}` : q.isPending ? "Loading…" : undefined}
        actions={<NewSalesOrderButton onCreated={setSelected} />} />

      {!q.error && <MetricRow metrics={metrics} className="mb-4" />}

      <div className="-mx-1 mb-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-body-md font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="tabular-nums text-muted-foreground">{count(t.key)}</span>
          </button>
        ))}
      </div>

      {q.error ? (
        <div className="surface-panel">
          <EmptyState title="Sales orders could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={o => o.id}
          name="Sales orders"
          loading={q.isPending}
          searchable
          searchValue={search}
          onSearchChange={setSearch}
          columnToggle
          exportable
          pageSize={25}
          onRowClick={o => setSelected(o.id)}
          isRowSelected={o => o.id === selected}
          empty={<EmptyState title="No sales orders" description={tab === "all" && !term ? "Sales orders appear here once they are booked." : "Nothing matches this filter yet."} />}
        />
      )}
      {!q.error && (
        <LoadMore shown={filtered.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
      )}

      {selected && <SalesOrderPanel key={selected} id={selected} />}
    </div>
  );
}
