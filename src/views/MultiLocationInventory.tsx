import { useQuery } from "@tanstack/react-query";
import { PageIcon } from "@/components/app/page-icon";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonTable } from "@/components/app/skeleton-block";
import { btnSecondary } from "@/components/app/controls";
import { apiGet } from "@/lib/api";
import type { StockOverview } from "@/server/inventory/stock-overview";

interface Location {
  id: string;
  code: string;
  name: string;
}

function getCoverageColor(days: number) {
  if (days === 0) return "bg-muted text-muted-foreground";
  if (days < 7) return "bg-danger/10 text-danger";
  if (days < 14) return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

/*
  A cell is coloured only when its cover is known. Stock at a location with no
  demand figure shows its quantity in a neutral chip — colouring it would
  claim a coverage judgement the data does not support.
*/
function StockCell({ qty, days }: { qty: number; days: number | null }) {
  if (qty <= 0) {
    return <span className={`inline-block px-2 py-1 rounded text-body-sm font-medium tabular-nums ${getCoverageColor(0)}`}>—</span>;
  }
  if (days === null) {
    return (
      <span
        className="inline-block px-2 py-1 rounded text-body-sm font-medium tabular-nums bg-secondary text-foreground"
        title="No average daily demand at this location — days of cover not calculated"
      >
        {qty.toLocaleString("en-IN")}
      </span>
    );
  }
  // Floored so the label and the colour agree: 6.9 days reads "6d" and is red.
  return (
    <span
      className={`inline-block px-2 py-1 rounded text-body-sm font-medium tabular-nums ${getCoverageColor(days)}`}
      title={`${days} days of cover`}
    >
      {`${qty.toLocaleString("en-IN")} (${Math.floor(days)}d)`}
    </span>
  );
}

export default function MultiLocationInventory() {
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: ({ signal }) => apiGet<Location[]>("/locations", undefined, { signal }),
    staleTime: 5 * 60_000,
  });

  // Same query as Stock overview's All Locations view, so the two pages share
  // one cache entry and always show the same numbers.
  const overviewQuery = useQuery({
    queryKey: ["inventory", "stock-overview", null],
    queryFn: ({ signal }) =>
      apiGet<StockOverview>("/inventory/stock-overview", undefined, { signal }),
  });

  const locations = locationsQuery.data ?? [];
  // Only materials physically held somewhere; the empty ones belong on Stock overview.
  const materials = (overviewQuery.data?.rows ?? []).filter((m) => m.onHand > 0);
  const loading = locationsQuery.isPending || overviewQuery.isPending;
  const error = locationsQuery.error ?? overviewQuery.error;

  const retry = () => {
    if (locationsQuery.isError) void locationsQuery.refetch();
    if (overviewQuery.isError) void overviewQuery.refetch();
  };

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Multi-location inventory</span>
        </h1>
      <div className="overflow-x-auto">
        {error ? (
          <div className="surface-panel">
            <EmptyState
              title="Stock could not be loaded"
              description={error.message}
              action={<button className={btnSecondary} onClick={retry}>Try again</button>}
            />
          </div>
        ) : loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : materials.length === 0 ? (
          <EmptyState title="No stock on hand" description="Materials appear here once they are held at a location." />
        ) : (
          <table className="data-table w-full text-body-md">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Material</th>
                {locations.map(l => <th key={l.id} className="text-center px-3 py-2.5 font-medium text-muted-foreground">{l.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.materialId} className="border-b border-border hover:bg-sunken">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  {locations.map((l) => (
                    <td key={l.id} className="px-3 py-2 text-center">
                      <StockCell qty={m.stockByLocation[l.id] ?? 0} days={m.coverDaysByLocation[l.id] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h3 className="text-body-md font-semibold mb-3">Stock in-transit</h3>
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Source", "Destination", "Material", "Qty", "Dispatched", "ETA", "Status"].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            <tr>
              <td colSpan={7}>
                <EmptyState
                  title="Transfers aren't tracked yet"
                  description="Stock moving between locations will appear here once inter-location transfers are recorded in Anvaya."
                  className="py-8"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
