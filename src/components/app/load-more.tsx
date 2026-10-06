import { btnSecondary } from "@/components/app/controls";

/** Under a paged list: how much of it is loaded, and a button for the next page. */
export function LoadMore({ shown, total, hasMore, loading, onLoadMore }: {
  shown: number;
  total?: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore && (total === undefined || shown >= total)) return null;
  return (
    <div className="mt-3 flex items-center gap-3 text-body-sm text-muted-foreground">
      {total !== undefined && <span>Showing {shown.toLocaleString()} of {total.toLocaleString()}</span>}
      {hasMore && (
        <button className={btnSecondary} disabled={loading} onClick={onLoadMore}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
