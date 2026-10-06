import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnSecondary } from "@/components/app/controls";
import { apiGet } from "@/lib/api";
import { LoadMore } from "@/components/app/load-more";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";

import { formatQty, inrCompact } from "@/lib/format";
import type { PoStatus, PurchaseOrderDetail, PurchaseOrderList, PurchaseOrderRow } from "@/server/purchasing/purchase-orders";
import { NewPurchaseOrderButton, PurchaseOrderActions } from "@/components/purchasing/po-actions";

type TabKey = "all" | "overdue" | PoStatus;

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "APPROVED", label: "Approved" },
  { key: "ORDERED", label: "Ordered" },
  { key: "PARTIALLY_RECEIVED", label: "Partially Received" },
  { key: "FULLY_RECEIVED", label: "Fully Received" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "overdue", label: "Overdue" },
];

const statusMap: Record<PoStatus, { status: "green" | "amber" | "red" | "blue" | "gray"; label: string }> = {
  DRAFT: { status: "gray", label: "Draft" },
  APPROVED: { status: "blue", label: "Approved" },
  ORDERED: { status: "blue", label: "Ordered" },
  PARTIALLY_RECEIVED: { status: "amber", label: "Partially Received" },
  FULLY_RECEIVED: { status: "green", label: "Fully Received" },
  CANCELLED: { status: "red", label: "Cancelled" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground block">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function PurchaseOrderPanel({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const q = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: ({ signal }) => apiGet<PurchaseOrderDetail>(`/purchase-orders/${id}`, undefined, { signal }),
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
        <EmptyState title="Purchase order could not be loaded" description={q.error.message}
          action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      </div>
    );
  }

  const po = q.data;
  // A draft has not been approved; anything past draft should name who approved it.
  const approval = po.approvedBy
    ? `${po.approvedBy.name}${po.approvedAt ? ` · ${fmtDate(po.approvedAt)}` : ""}`
    : po.status === "DRAFT" ? "Not yet approved" : "Not recorded";

  return (
    <div className="surface-panel mt-4 p-4 space-y-4">
      <h3 className="text-body-md font-semibold flex items-center gap-2 flex-wrap">
        Purchase order — <span className="identifier">{po.orderNumber}</span>
        <StatusBadge {...statusMap[po.status]} />
        {po.overdue && <StatusBadge status="red" label="Overdue" />}
      </h3>

      <PurchaseOrderActions po={po} onDeleted={onDeleted} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-body-sm">
        <Fact label="Vendor">
          {po.vendor.name} <span className="identifier text-muted-foreground">{po.vendor.code}</span>
          {!po.vendor.isApproved && <span className="text-danger"> · not on ASL</span>}
        </Fact>
        <Fact label="Deliver to">{po.location.name}</Fact>
        <Fact label="Ordered">{fmtDate(po.orderDate)}</Fact>
        <Fact label="Expected delivery">
          <span className={po.overdue ? "text-danger" : ""}>{fmtDate(po.expectedDeliveryDate)}</span>
        </Fact>
        <Fact label="Delivered">
          {po.delivered
            ? <>{fmtDate(po.delivered.date)} <span className="text-muted-foreground font-normal">{po.delivered.source === "ACTUAL" ? "(recorded delivery)" : "(latest GRN receipt date)"}</span></>
            : <span className="text-muted-foreground">No receipt yet</span>}
        </Fact>
        <Fact label="Value">
          {rupees(po.totalAmount)} {po.currencyCode !== "INR" && po.currencyCode}
          {po.totalMismatch && <span className="text-danger font-normal"> · differs from its lines</span>}
        </Fact>
        <Fact label="Created by">{po.createdBy.name}</Fact>
        <Fact label="Approved by"><span className={po.approvedBy ? "" : "text-muted-foreground"}>{approval}</span></Fact>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Lines</span>
        <div className="mt-1 overflow-x-auto">
          <table className="data-table w-full text-body-sm">
            <thead><tr className="border-b border-border">
              {["#", "Material", "Ordered", "Received", "Outstanding", "Unit price", "Line total", "Expected"].map((h) =>
                <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.lineNumber} className="border-b border-border">
                  <td className="px-2 py-1.5 tabular-nums">{l.lineNumber}</td>
                  <td className="px-2 py-1.5"><span className="identifier text-muted-foreground">{l.material.code}</span> <span className="font-medium">{l.material.name}</span></td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.orderedQty)} {l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatQty(l.receivedQty)} {l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.outstandingQty > 0 ? `${formatQty(l.outstandingQty)} ${l.uom}` : "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{rupees(l.unitPrice)}/{l.uom}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{rupees(l.lineTotal)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={l.overdue ? "text-danger font-medium" : ""}>{fmtDate(l.expectedDeliveryDate)}</span>
                    {l.overdue && <span className="text-caption text-danger"> (overdue)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Goods receipts</span>
        <div className="mt-1 space-y-1">
          {po.receipts.length ? po.receipts.map((r) => (
            <div key={r.id} className="text-body-sm px-2 py-1.5 rounded bg-secondary/50">
              <span className="identifier text-foreground">{r.grnNumber}</span>
              <span className="text-muted-foreground"> · {fmtDate(r.receiptDate)} · {r.location}</span>
              {r.lines.map((gl) => (
                <span key={gl.lineNumber} className="block text-muted-foreground">
                  Line {gl.lineNumber}: {gl.materialCode} {formatQty(gl.receivedQty)} {gl.uom}
                  {gl.lotNumber ? <> · lot <span className="identifier">{gl.lotNumber}</span></> : " · no lot recorded"}
                  {" "}· inspection {gl.inspectionStatus.toLowerCase()}
                </span>
              ))}
            </div>
          )) : <div className="text-body-sm text-muted-foreground">Nothing received yet</div>}
        </div>
      </div>

      {po.notes && <p className="text-body-sm text-muted-foreground whitespace-pre-line">Notes: {po.notes}</p>}
    </div>
  );
}

export default function PurchaseOrders() {
  const [tab, setTab] = useState<TabKey>("all");
  const [selected, setSelected] = useState<string | null>(null);

  // Paged on the server: the tab and search filter there; counts cover the company.
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const q = usePagedQuery<PurchaseOrderList>(["purchase-orders"], "/purchase-orders", { status: tab === "all" ? undefined : tab, q: term || undefined });
  const list = q.data?.pages[0]?.data;
  const total = q.data?.pages[0]?.meta?.total;
  const filteredPOs = useMemo(() => q.data?.pages.flatMap((p) => p.data.orders) ?? [], [q.data]);

  const columns: Column<PurchaseOrderRow>[] = [
    { key: "po", header: "PO number", width: "w-[140px]", value: p => p.orderNumber, cell: p => <span className="identifier text-body-sm">{p.orderNumber}</span> },
    { key: "vendor", header: "Vendor", value: p => p.vendor.name, cell: p => <span className="font-medium">{p.vendor.name}</span> },
    { key: "date", header: "Order date", width: "w-[130px]", value: p => p.orderDate, cell: p => fmtDate(p.orderDate) },
    {
      key: "delivery", header: "Expected delivery", width: "w-[170px]", value: p => p.expectedDeliveryDate,
      cell: p => p.overdue
        ? <span className="text-danger font-medium whitespace-nowrap" title="Open, past its expected date, with quantity outstanding">{fmtDate(p.expectedDeliveryDate)} <span className="text-caption">(overdue)</span></span>
        : <span className="whitespace-nowrap">{fmtDate(p.expectedDeliveryDate)}</span>,
    },
    { key: "value", header: "Value", align: "right", numeric: true, width: "w-[100px]", value: p => p.totalAmount, cell: p => inrCompact(p.totalAmount) },
    { key: "items", header: "Items", align: "right", numeric: true, width: "w-[70px]", value: p => p.lineCount, cell: p => p.lineCount },
    {
      key: "received", header: "Received", align: "right", numeric: true, width: "w-[100px]",
      value: p => p.receivedPct ?? -1,
      cell: p => p.receivedPct === null ? "—" : <span title="Share of the ordered value received">{p.receivedPct}%</span>,
    },
    {
      key: "status", header: "Status", width: "w-[150px]", value: p => statusMap[p.status].label,
      cell: p => <StatusBadge {...statusMap[p.status]} />,
    },
  ];

  const count = (key: TabKey) => (list ? list.counts[key] : "—");

  return (
    <div className="px-6 py-5">
      <PageHeader title="Purchase orders"
        description={total !== undefined ? `${total.toLocaleString()} order${total === 1 ? "" : "s"}` : q.isPending ? "Loading…" : undefined}
        actions={<NewPurchaseOrderButton onCreated={setSelected} />} />

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
          <EmptyState title="Purchase orders could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredPOs}
          rowKey={p => p.id}
          name="Purchase orders"
          loading={q.isPending}
          searchable
          searchValue={search}
          onSearchChange={setSearch}
          columnToggle
          exportable
          pageSize={25}
          onRowClick={p => setSelected(p.id)}
          isRowSelected={p => p.id === selected}
          empty={<EmptyState title="No purchase orders" description={tab === "all" && !term ? "Purchase orders appear here once they are raised." : "Nothing matches this filter yet."} />}
        />
      )}
      {!q.error && (
        <LoadMore shown={filteredPOs.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
      )}

      {selected && <PurchaseOrderPanel key={selected} id={selected} onDeleted={() => setSelected(null)} />}
    </div>
  );
}
