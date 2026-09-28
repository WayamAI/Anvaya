import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { MaterialIcon } from "@/components/app/material-icon";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageIcon } from "@/components/app/page-icon";
import { btnSecondary } from "@/components/app/controls";
import { apiGet } from "@/lib/api";
import { inrCompact } from "@/lib/format";
import type { StockOverview as StockOverviewData, StockOverviewRow, StockStatus } from "@/server/inventory/stock-overview";
import { CountButton } from "@/components/inventory/adjust-stock";

interface Location {
  id: string;
  code: string;
  name: string;
  city: string | null;
}

const statusBadge: Record<StockStatus, { status: "green" | "amber" | "red" | "gray"; label: string }> = {
  adequate: { status: "green", label: "Adequate" },
  low: { status: "amber", label: "Low" },
  critical: { status: "red", label: "Critical" },
  unplanned: { status: "gray", label: "No policy" },
};

const qty = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN"));


export default function StockOverview() {
  // null means every location.
  const [locationId, setLocationId] = useState<string | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: ({ signal }) => apiGet<Location[]>("/locations", undefined, { signal }),
    staleTime: 5 * 60_000,
  });

  const overviewQuery = useQuery({
    queryKey: ["inventory", "stock-overview", locationId],
    queryFn: ({ signal }) =>
      apiGet<StockOverviewData>("/inventory/stock-overview", { locationId }, { signal }),
    // Keeps the current table on screen while another location loads, rather
    // than flashing back to skeleton rows on every filter click.
    placeholderData: keepPreviousData,
  });

  const locations = locationsQuery.data ?? [];
  const visibleLocations = locationId ? locations.filter((l) => l.id === locationId) : locations;
  const overview = overviewQuery.data;
  const summary = overview?.summary;
  const error = locationsQuery.error ?? overviewQuery.error;
  // The location columns and tabs come from the locations query, so the table
  // is only trustworthy when both have loaded.
  const failed = locationsQuery.isError || (overviewQuery.isError && !overview);
  const loading = overviewQuery.isPending || locationsQuery.isPending;

  const retry = () => {
    if (locationsQuery.isError) void locationsQuery.refetch();
    if (overviewQuery.isError) void overviewQuery.refetch();
  };

  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  // Names where the thresholds come from, so a reorder point shown in the
  // All Locations view is never mistaken for a network-wide policy.
  const policySource = (s: StockOverviewRow) =>
    s.policyLocationIds.length
      ? `Policy at ${s.policyLocationIds.map((id) => locationName.get(id) ?? id).join(", ")}`
      : "No planning policy in scope";

  const columns: Column<StockOverviewRow>[] = [
    { key: "code", header: "Code", width: "w-[96px]", value: s => s.code, cell: s => <span className="identifier text-body-sm">{s.code}</span> },
    {
      key: "name", header: "Material", value: s => s.name,
      // The glyph rides with the name rather than taking a column of its own,
      // so the column count and every header stay as they were.
      cell: s => (
        <span className="flex items-center gap-2">
          <MaterialIcon code={s.code} />
          <span className="truncate">{s.name}</span>
        </span>
      ),
    },
    { key: "cat", header: "Category", width: "w-[110px]", value: s => s.category ?? "", cell: s => <span className="text-muted-foreground">{s.category ?? "—"}</span> },
    { key: "uom", header: "UOM", width: "w-[70px]", value: s => s.uom, cell: s => s.uom },
    // One column per location, from the locations API.
    ...visibleLocations.map<Column<StockOverviewRow>>((l) => ({
      key: `loc-${l.id}`,
      header: `Stock (${l.city ?? l.name})`,
      align: "right",
      numeric: true,
      width: "w-[130px]",
      value: s => s.stockByLocation[l.id] ?? 0,
      cell: s => qty(s.stockByLocation[l.id] ?? 0),
    })),
    { key: "total", header: "Total", align: "right", numeric: true, width: "w-[100px]", value: s => s.onHand, cell: s => <span className="font-medium">{qty(s.onHand)}</span> },
    { key: "rop", header: "Reorder pt", align: "right", numeric: true, width: "w-[110px]", value: s => s.reorderPoint ?? -1, cell: s => <span title={policySource(s)}>{qty(s.reorderPoint)}</span> },
    { key: "ss", header: "Safety stock", align: "right", numeric: true, width: "w-[120px]", value: s => s.safetyStock ?? -1, cell: s => <span title={policySource(s)}>{qty(s.safetyStock)}</span> },
    { key: "avgCost", header: "Avg cost", align: "right", numeric: true, width: "w-[100px]", value: s => s.avgCost ?? -1, cell: s => (s.avgCost === null ? "—" : `₹${s.avgCost.toLocaleString("en-IN")}`) },
    { key: "value", header: "Value (₹L)", align: "right", numeric: true, width: "w-[110px]", value: s => s.value, cell: s => `₹${(s.value / 1e5).toFixed(2)}L` },
    { key: "status", header: "Status", width: "w-[110px]", value: s => statusBadge[s.status].label, cell: s => <StatusBadge {...statusBadge[s.status]} /> },
    { key: "count", header: "", width: "w-[70px]", value: () => "", cell: s => <CountButton materialId={s.materialId} label={s.code} /> },
  ];

  const tabs = [{ id: null as string | null, name: "All Locations" }, ...locations];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Stock overview</span>
        </h1>
      </div>

      <div className="flex gap-1">
        {tabs.map((w) => (
          <button key={w.id ?? "all"} onClick={() => setLocationId(w.id)} className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${locationId === w.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
            {w.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total SKUs" value={summary ? summary.totalSkus.toLocaleString("en-IN") : "—"} iconName="total-skus" />
        <KPICard title="Total stock value" value={summary ? inrCompact(summary.totalValue) : "—"} iconName="stock-value" />
        <KPICard title="Below reorder point" value={summary ? summary.belowReorderPoint : "—"} subtitle={summary ? `${summary.critical} critical` : undefined} iconName="below-reorder-point" status={summary?.belowReorderPoint ? "red" : undefined} />
        <KPICard title={summary ? `Dead stock (>${summary.deadStockDays}d)` : "Dead stock"} value={summary ? `${summary.deadStockSkus} SKUs` : "—"} subtitle={summary ? inrCompact(summary.deadStockValue) : undefined} iconName="dead-stock" status={summary?.deadStockSkus ? "amber" : undefined} />
      </div>

      <div>
        {failed ? (
          <div className="surface-panel">
            <EmptyState
              title="Stock could not be loaded"
              description={error?.message}
              action={<button className={btnSecondary} onClick={retry}>Try again</button>}
            />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={overview?.rows ?? []}
            rowKey={s => s.materialId}
            name="Stock overview"
            loading={loading}
            empty={
              <EmptyState
                title={locationId ? "No stock at this location" : "No materials yet"}
                description={locationId ? "Nothing is stocked or planned here." : "Materials appear here once they are added to the item master."}
              />
            }
            searchable
            columnToggle
            exportable
            pageSize={25}
          />
        )}
      </div>
    </div>
  );
}
