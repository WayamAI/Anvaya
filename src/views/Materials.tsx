import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { LoadMore } from "@/components/app/load-more";
import { btnSecondary, selectSm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { MaterialFormButton, PolicyFormButton, type MaterialFormRecord, type PolicyFormRecord } from "@/components/masterdata/master-forms";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/format";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";

/**
 * The item master: every material, its unit and tracking, and the planning
 * policy MRP uses for it at each location.
 */

interface MaterialRow extends MaterialFormRecord {
  category: { id: string; code: string; name: string } | null;
  unit: { id: string; code: string; name: string };
}
interface MaterialDetail extends MaterialRow {
  policies: (PolicyFormRecord & { id: string; location: { id: string; code: string; name: string } })[];
  balances: { location: { id: string; name: string }; onHandQty: number; reservedQty: number; quarantineQty: number }[];
}

const KIND_LABEL: Record<string, string> = {
  RAW: "Raw material", PACKAGING: "Packaging", SEMI_FINISHED: "Semi-finished", FINISHED: "Finished good", CONSUMABLE: "Consumable",
};
const RULE_LABEL: Record<string, string> = {
  LOT_FOR_LOT: "Lot for lot", FIXED_ORDER_QTY: "Fixed qty", MIN_ORDER_QTY: "Minimum qty", PERIOD_ORDER_QTY: "Period qty",
};

function MaterialPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["material", id], queryFn: ({ signal }) => apiGet<MaterialDetail>(`/materials/${id}`, undefined, { signal }) });
  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: () => apiGet<{ id: string; name: string }[]>("/locations") });
  if (q.isPending) return <div className="surface-panel p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}</div>;
  if (q.error) {
    return (
      <div className="surface-panel">
        <EmptyState title="Material could not be loaded" description={q.error.message} action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      </div>
    );
  }
  const m = q.data;
  const planned = new Set(m.policies.map((p) => p.location.id));
  const unplanned = (locations.data ?? []).filter((l) => !planned.has(l.id));
  return (
    <div className="surface-panel p-4 space-y-4">
      <h3 className="text-body-md font-semibold flex flex-wrap items-center gap-2">
        {m.name} <span className="identifier text-muted-foreground font-normal">{m.code}</span>
        {!m.isActive && <StatusBadge status="gray" label="Inactive" />}
        <span className="ml-auto"><MaterialFormButton material={m} /></span>
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-body-sm">
        <div><span className="text-muted-foreground block">Kind</span><span className="font-medium">{KIND_LABEL[m.kind] ?? m.kind}</span></div>
        <div><span className="text-muted-foreground block">Unit</span><span className="font-medium">{m.unit.code}</span></div>
        <div><span className="text-muted-foreground block">Standard cost</span><span className="font-medium">{m.standardCost === null ? "—" : `₹${m.standardCost.toLocaleString("en-IN")}`}</span></div>
        <div><span className="text-muted-foreground block">Shelf life</span><span className="font-medium">{m.shelfLifeDays === null ? "—" : `${m.shelfLifeDays} days`}</span></div>
        <div><span className="text-muted-foreground block">Tracking</span><span className="font-medium">{m.isBatchTracked ? "By lot" : "Quantity only"}</span></div>
      </div>
      {m.description && <p className="text-body-sm text-muted-foreground">{m.description}</p>}

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm text-muted-foreground font-medium">Planning policies ({m.policies.length})</span>
          {unplanned.length > 0 && <PolicyFormButton materialId={m.id} materialCode={m.code} locations={unplanned} />}
        </div>
        {m.policies.length ? (
          <div className="overflow-x-auto">
            <table className="data-table mt-1 w-full text-body-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground">
                {["Location", "Supply", "Safety stock", "Reorder point", "Lot sizing", "Min / max / multiple", "Lead time", "Status", ""].map((h) =>
                  <th key={h} className="py-1.5 pr-3 font-medium whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {m.policies.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3">{p.location.name}</td>
                    <td className="py-1.5 pr-3">{p.procurementType === "MAKE" ? "Make" : "Buy"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatQty(p.safetyStock ?? 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatQty(p.reorderPoint ?? 0)}</td>
                    <td className="py-1.5 pr-3">{RULE_LABEL[p.lotSizingRule] ?? p.lotSizingRule}{p.periodDays ? ` · ${p.periodDays} d` : ""}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatQty(p.minOrderQty ?? 0)} / {p.maxOrderQty === null ? "—" : formatQty(p.maxOrderQty)} / {formatQty(p.orderMultiple ?? 0)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{p.procurementType === "MAKE" ? `${p.productionLeadTimeDays} d` : "Vendor"}{p.safetyLeadTimeDays ? ` + ${p.safetyLeadTimeDays} d` : ""}</td>
                    <td className="py-1.5 pr-3">{p.isActive ? "Planned" : "Not planned"}</td>
                    <td className="py-1.5 text-right"><PolicyFormButton materialId={m.id} materialCode={m.code} policy={p} locations={[p.location]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-1 text-body-sm text-muted-foreground">No location plans this material yet, so MRP leaves it out.</p>}
      </div>

      {m.balances.length > 0 && (
        <div>
          <span className="text-body-sm text-muted-foreground font-medium">Stock</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {m.balances.map((b) => (
              <span key={b.location.id} className="rounded bg-secondary/50 px-2 py-1 text-body-sm">
                {b.location.name}: <span className="tabular-nums font-medium">{formatQty(b.onHandQty)}</span> {m.unit.code}
                {b.quarantineQty > 0 && <span className="text-muted-foreground"> · {formatQty(b.quarantineQty)} held</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Materials() {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [active, setActive] = useState<"true" | "false" | "all">("true");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const q = usePagedQuery<MaterialRow[]>(["materials"], "/materials", { q: term || undefined, active, kind: kind || undefined });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.meta?.total;

  const columns: Column<MaterialRow>[] = [
    { key: "code", header: "Code", width: "w-[120px]", value: (m) => m.code, cell: (m) => <span className="identifier text-body-sm">{m.code}</span> },
    { key: "name", header: "Material", value: (m) => m.name, cell: (m) => <span className="font-medium">{m.name}</span> },
    { key: "kind", header: "Kind", width: "w-[140px]", value: (m) => KIND_LABEL[m.kind] ?? m.kind, cell: (m) => KIND_LABEL[m.kind] ?? m.kind },
    { key: "category", header: "Category", width: "w-[160px]", value: (m) => m.category?.name ?? "", cell: (m) => m.category?.name ?? "—" },
    { key: "unit", header: "Unit", width: "w-[80px]", value: (m) => m.unit.code, cell: (m) => m.unit.code },
    { key: "lot", header: "Tracking", width: "w-[110px]", value: (m) => (m.isBatchTracked ? "By lot" : "Quantity"), cell: (m) => (m.isBatchTracked ? "By lot" : "Quantity") },
    { key: "status", header: "Status", width: "w-[110px]", value: (m) => (m.isActive ? 1 : 0), cell: (m) => <StatusBadge status={m.isActive ? "green" : "gray"} label={m.isActive ? "Active" : "Inactive"} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Materials</span>
        </h1>
        <div className="flex items-center gap-2">
          <select className={cn(selectSm, "w-auto")} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
            <option value="">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={cn(selectSm, "w-auto")} value={active} onChange={(e) => setActive(e.target.value as typeof active)} aria-label="Show">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
          <MaterialFormButton onSaved={setSelected} />
        </div>
      </div>

      {q.error ? (
        <EmptyState title="Materials could not be loaded" description={q.error.message} action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      ) : (
        <div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            name="Materials"
            loading={q.isPending}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            exportable
            pageSize={25}
            onRowClick={(m) => setSelected(m.id)}
            isRowSelected={(m) => m.id === selected}
            empty={<EmptyState title={term || kind ? "Nothing matches" : "No materials"} description={term || kind ? "No material matches these filters." : "Materials appear here once they are set up."} />}
          />
          <LoadMore shown={rows.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
        </div>
      )}

      {selected ? <MaterialPanel key={selected} id={selected} /> : !q.error && rows.length > 0 && (
        <p className="text-body-sm text-muted-foreground">Select a material for its planning policies and stock.</p>
      )}
    </div>
  );
}
