import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorNote } from "@/components/app/api-error-note";
import { LoadMore } from "@/components/app/load-more";
import { btnGhostSm, btnPrimary, btnSecondary } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { useSession } from "@/components/auth/session-context";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { formatQty, inrCompact } from "@/lib/format";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";
import type { PurchaseOrderList } from "@/server/purchasing/purchase-orders";

/**
 * Purchase planning: the planned purchases from the latest MRP run — what to
 * order, from whom, by when — and their conversion into draft purchase
 * orders. Cost is the suggested vendor's list price, an estimate only.
 */

interface Run {
  id: string; runNumber: string; asOfDate: string; isLatest: boolean; completedAt: string | null;
  plannedOrders: { type: "PURCHASE" | "PRODUCTION"; status: string; count: number }[];
}
interface PlannedPurchase {
  id: string; type: "PURCHASE"; status: string;
  material: { id: string; code: string; name: string }; uom: string; location: { id: string; name: string };
  quantity: number; releaseDate: string; requiredDate: string; leadTimeDays: number;
  vendor: { code: string; name: string } | null; price: { unitPrice: number; currencyCode: string } | null;
  pastDue: boolean; demands: string[]; blocker: string | null;
  convertedTo: { type: string; number: string | null } | null;
}

const DAY = 86_400_000;
const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const daysFrom = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

type Priority = "red" | "amber" | "green";
const priorityLabel: Record<Priority, string> = { red: "Order now", amber: "This week", green: "Planned" };

export default function PurchasePlanning() {
  const { can } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
  const ordersQ = usePagedQuery<PlannedPurchase[]>(
    ["mrp", "planned", run?.id, "purchase"], `/mrp/runs/${run?.id}/planned-orders`,
    { type: "PURCHASE", status: openOnly ? "PLANNED" : undefined, q: term || undefined, limit: "500" },
    { enabled: !!run },
  );
  const poQ = useQuery({
    queryKey: ["purchase-orders", "counts"],
    queryFn: () => apiGet<PurchaseOrderList>("/purchase-orders", { limit: 1 }),
    enabled: can("purchase-order:read"),
  });

  const orders = useMemo(() => ordersQ.data?.pages.flatMap((p) => p.data) ?? [], [ordersQ.data]);
  const total = ordersQ.data?.pages[0]?.meta?.total;
  const allLoaded = !ordersQ.hasNextPage;

  const priority = (o: PlannedPurchase): Priority =>
    o.pastDue || (run && daysFrom(run.asOfDate, o.releaseDate) <= 0) ? "red"
      : run && daysFrom(run.asOfDate, o.releaseDate) <= 7 ? "amber" : "green";

  const canConvert = can("purchase-order:create") && !!run?.isLatest;
  const convertible = useMemo(() => new Set(orders.filter((o) => o.status === "PLANNED" && !o.blocker).map((o) => o.id)), [orders]);

  const toPlace = run?.plannedOrders.filter((g) => g.type === "PURCHASE" && g.status === "PLANNED").reduce((a, g) => a + g.count, 0) ?? 0;
  const open = orders.filter((o) => o.status === "PLANNED");
  const urgent = open.filter((o) => priority(o) === "red").length;
  const noVendor = open.filter((o) => !o.vendor).length;
  const estValue = open.reduce((a, o) => a + (o.price ? o.price.unitPrice * o.quantity : 0), 0);
  const unpriced = open.filter((o) => !o.price).length;

  const convert = useMutation({
    mutationFn: () => apiSend<{ purchaseOrders: { orderNumber: string }[] }>("POST", `/mrp/runs/${run!.id}/convert`, { plannedOrderIds: [...selected] }),
    onSuccess: (r) => {
      setSelected(new Set());
      toast.success(`Created draft ${r.purchaseOrders.map((p) => p.orderNumber).join(", ")}`, {
        action: { label: "Open purchase orders", onClick: () => router.push("/purchase-orders") },
      });
      void qc.invalidateQueries({ queryKey: ["mrp"] });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const columns: Column<PlannedPurchase>[] = [
    ...(canConvert ? [{
      key: "select", header: "", width: "w-[44px]", sortable: false,
      cell: (o: PlannedPurchase) => (
        <input type="checkbox" className="rounded" aria-label={`Select ${o.material.code}`} disabled={!convertible.has(o.id)}
          title={o.status === "PLANNED" && o.blocker ? o.blocker : undefined}
          checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
      ),
    } satisfies Column<PlannedPurchase>] : []),
    {
      key: "priority", header: "Priority", width: "w-[120px]", value: (o) => (o.status === "PLANNED" ? priorityLabel[priority(o)] : o.status),
      cell: (o) => o.convertedTo
        ? <StatusBadge status="blue" label={o.convertedTo.number ?? "Converted"} />
        : o.status !== "PLANNED" ? <StatusBadge status="gray" label={o.status.charAt(0) + o.status.slice(1).toLowerCase()} />
          : <StatusBadge status={priority(o)} label={priorityLabel[priority(o)]} />,
    },
    {
      key: "material", header: "Material", value: (o) => `${o.material.code} ${o.material.name}`,
      cell: (o) => <span><span className="identifier text-body-sm text-muted-foreground">{o.material.code}</span> <span className="font-medium">{o.material.name}</span></span>,
    },
    { key: "location", header: "Deliver to", width: "w-[120px]", value: (o) => o.location.name, cell: (o) => <span className="text-muted-foreground">{o.location.name}</span> },
    { key: "reqDate", header: "Needed", width: "w-[120px]", value: (o) => o.requiredDate, cell: (o) => fmtDate(o.requiredDate) },
    { key: "qty", header: "Qty", align: "right", numeric: true, width: "w-[120px]", value: (o) => o.quantity, cell: (o) => `${formatQty(o.quantity)} ${o.uom}` },
    { key: "vendor", header: "Vendor", value: (o) => o.vendor?.name ?? "", cell: (o) => o.vendor?.name ?? <span className="text-danger">No vendor on file</span> },
    { key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[85px]", value: (o) => o.leadTimeDays, cell: (o) => o.leadTimeDays },
    {
      key: "orderDate", header: "Order by", width: "w-[130px]", value: (o) => o.releaseDate,
      cell: (o) => <span className={o.pastDue ? "font-medium text-danger" : "font-medium"}>{fmtDate(o.releaseDate)}{o.pastDue ? " (late)" : ""}</span>,
    },
    {
      key: "cost", header: "Est. cost", align: "right", numeric: true, width: "w-[110px]", value: (o) => (o.price ? o.price.unitPrice * o.quantity : -1),
      cell: (o) => (o.price ? inrCompact(o.price.unitPrice * o.quantity) : <span className="text-muted-foreground" title="No list price for this vendor">—</span>),
    },
    { key: "demand", header: "For", value: (o) => o.demands.join(", "), cell: (o) => <span className="text-caption text-muted-foreground">{o.demands.slice(0, 2).join(", ")}{o.demands.length > 2 ? "…" : ""}</span> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
        <PageIcon />
        <span className="min-w-0">Purchase planning</span>
      </h1>

      {runQ.error ? (
        <EmptyState title="Purchase plan could not be loaded" description={runQ.error.message}
          action={<button className={btnSecondary} onClick={() => void runQ.refetch()}>Try again</button>} />
      ) : !runQ.isPending && !run ? (
        <EmptyState title="No MRP run yet" description="Planned purchases appear here once MRP has been run."
          action={can("mrp:run") ? <button className={btnPrimary} onClick={() => router.push("/mrp-run")}>Go to MRP run</button> : undefined} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard title="Planned purchases to place" value={runQ.isPending ? "—" : toPlace}
              subtitle={estValue > 0 ? `${inrCompact(estValue)} est.${!allLoaded || unpriced ? " (priced lines shown)" : ""}` : undefined}
              iconName="planned-pos" status={toPlace ? "amber" : "green"} />
            <KPICard title="To order now" value={ordersQ.isPending ? "—" : urgent}
              subtitle={noVendor ? `${noVendor} without a vendor` : "Order-by date today or past"} icon={AlertTriangle} status={urgent ? "red" : "green"} />
            <KPICard title="Overdue purchase orders" value={poQ.data ? poQ.data.counts.overdue : "—"}
              subtitle={poQ.data ? `${poQ.data.counts.DRAFT} draft awaiting approval` : can("purchase-order:read") ? undefined : "No access to purchase orders"}
              iconName="requisitions" status={poQ.data?.counts.overdue ? "red" : undefined} />
          </div>

          {run && (
            <p className="text-body-sm text-muted-foreground">
              From <span className="identifier">{run.runNumber}</span>, planned as of {fmtDate(run.asOfDate)}.
              {!run.isLatest && " A newer run exists; convert from the latest plan."}
              {" "}Order-by is the date to place the order so it arrives in time, given the vendor's lead time.
            </p>
          )}

          {canConvert && (
            <div className="flex flex-wrap items-center gap-2 text-body-sm">
              <button className={btnGhostSm} onClick={() => setSelected(new Set(convertible))}>Select all with a vendor ({convertible.size})</button>
              {selected.size > 0 && <button className={btnGhostSm} onClick={() => setSelected(new Set())}>Clear</button>}
              <button className={btnPrimary} disabled={!selected.size || convert.isPending} onClick={() => convert.mutate()}>
                {convert.isPending ? "Creating…" : `Create draft POs${selected.size ? ` (${selected.size})` : ""}`}
              </button>
              <span className="text-muted-foreground">One draft PO per vendor and location, each line on its own date. Drafts go for approval on Purchase orders.</span>
            </div>
          )}
          <ErrorNote error={convert.error} />

          <label className="flex items-center gap-1.5 text-body-sm">
            <input type="checkbox" className="rounded" checked={openOnly} onChange={() => { setOpenOnly(!openOnly); setSelected(new Set()); }} /> Open only (hide converted)
          </label>

          {ordersQ.error ? (
            <EmptyState title="Planned purchases could not be loaded" description={ordersQ.error.message}
              action={<button className={btnSecondary} onClick={() => void ordersQ.refetch()}>Try again</button>} />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                columns={columns}
                rows={orders}
                rowKey={(o) => o.id}
                name="Purchase planning"
                loading={runQ.isPending || ordersQ.isPending}
                searchable
                searchValue={search}
                onSearchChange={setSearch}
                columnToggle
                exportable
                pageSize={25}
                empty={<EmptyState title={term ? "Nothing matches" : "Nothing to buy"} description={term ? "No planned purchase matches this search." : "Stock and open purchase orders cover every requirement in the plan."} />}
              />
              <LoadMore shown={orders.length} total={total} hasMore={!!ordersQ.hasNextPage} loading={ordersQ.isFetchingNextPage} onLoadMore={() => void ordersQ.fetchNextPage()} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
