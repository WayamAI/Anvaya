import StatusBadge from "@/components/StatusBadge";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnGhostSm, btnSecondary } from "@/components/app/controls";
import { cn } from "@/lib/utils";

/**
 * An MRP run's exceptions. Loading, failure, "none" and a list are four
 * distinct states: a run whose exceptions could not be fetched must never
 * read as a run that has none.
 */

export interface MrpException {
  id: string; type: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; message: string; suggestedAction: string | null;
  material: { code: string; name: string } | null; location: { name: string } | null; dueDate: string | null; daysLate: number | null;
  isResolved: boolean;
}

export type ExceptionsState =
  | { status: "pending" }
  | { status: "error"; error: Error }
  | { status: "success"; exceptions: MrpException[]; hasMore: boolean; loadingMore?: boolean };

const severityColor = { CRITICAL: "red", HIGH: "red", MEDIUM: "amber", LOW: "gray" } as const;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function ExceptionsPanel({ state, canResolve, resolving, onResolve, onRetry, onLoadMore }: {
  state: ExceptionsState;
  canResolve: boolean;
  resolving?: boolean;
  onResolve: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  if (state.status === "pending") {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading exceptions">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <EmptyState title="Exceptions could not be loaded" description={state.error.message}
        action={<button className={btnSecondary} onClick={onRetry}>Try again</button>} />
    );
  }
  if (!state.exceptions.length) return <EmptyState title="No exceptions" description="The plan needs no attention." />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Severity", "Type", "Material", "Detail", "Recommended action", ""].map((h) => <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {state.exceptions.map((e) => (
              <tr key={e.id} className={cn("border-b border-border", e.isResolved && "opacity-50")}>
                <td className="px-3 py-2"><StatusBadge status={severityColor[e.severity]} label={titleCase(e.severity)} /></td>
                <td className="px-3 py-2 whitespace-nowrap">{titleCase(e.type)}</td>
                <td className="px-3 py-2"><span className="identifier">{e.material?.code ?? "—"}</span> <span className="text-muted-foreground">{e.location?.name ?? ""}</span></td>
                <td className="px-3 py-2">{e.message}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.suggestedAction ?? "—"}</td>
                <td className="px-3 py-2">
                  {e.isResolved ? <span className="text-caption text-muted-foreground">Resolved</span>
                    : canResolve && <button className={btnGhostSm} disabled={resolving} onClick={() => onResolve(e.id)}>Resolve</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.hasMore && (
        <button className={btnSecondary} disabled={state.loadingMore} onClick={onLoadMore}>
          {state.loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
