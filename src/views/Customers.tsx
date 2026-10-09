import { useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { LoadMore } from "@/components/app/load-more";
import { btnSecondary, selectSm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { CustomerFormButton, type CustomerFormRecord } from "@/components/masterdata/master-forms";
import { cn } from "@/lib/utils";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";

/** The customers sales orders are booked against. */

const TYPE_LABEL: Record<string, string> = {
  DISTRIBUTOR: "Distributor", MODERN_TRADE: "Modern trade", ECOMMERCE: "E-commerce", INSTITUTIONAL: "Institutional",
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [active, setActive] = useState<"true" | "false" | "all">("true");

  const q = usePagedQuery<CustomerFormRecord[]>(["customers"], "/customers", { q: term || undefined, active });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.meta?.total;

  const columns: Column<CustomerFormRecord>[] = [
    { key: "code", header: "Code", width: "w-[120px]", value: (c) => c.code, cell: (c) => <span className="identifier text-body-sm">{c.code}</span> },
    { key: "name", header: "Customer", value: (c) => c.name, cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "type", header: "Channel", width: "w-[140px]", value: (c) => TYPE_LABEL[c.type] ?? c.type, cell: (c) => TYPE_LABEL[c.type] ?? c.type },
    { key: "contact", header: "Contact", width: "w-[200px]", value: (c) => c.contactPerson ?? "", cell: (c) => c.contactPerson ?? c.contactEmail ?? "—" },
    { key: "city", header: "City", width: "w-[140px]", value: (c) => c.city ?? "", cell: (c) => c.city ?? "—" },
    { key: "terms", header: "Payment terms", width: "w-[140px]", value: (c) => c.paymentTerms ?? "", cell: (c) => c.paymentTerms ?? "—" },
    { key: "status", header: "Status", width: "w-[100px]", value: (c) => (c.isActive ? 1 : 0), cell: (c) => <StatusBadge status={c.isActive ? "green" : "gray"} label={c.isActive ? "Active" : "Inactive"} /> },
    { key: "edit", header: "", width: "w-[80px]", value: () => "", cell: (c) => <span onClick={(e) => e.stopPropagation()}><CustomerFormButton customer={c} /></span> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Customers</span>
        </h1>
        <div className="flex items-center gap-2">
          <select className={cn(selectSm, "w-auto")} value={active} onChange={(e) => setActive(e.target.value as typeof active)} aria-label="Show">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
          <CustomerFormButton />
        </div>
      </div>

      {q.error ? (
        <EmptyState title="Customers could not be loaded" description={q.error.message} action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      ) : (
        <div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            name="Customers"
            loading={q.isPending}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            exportable
            pageSize={25}
            empty={<EmptyState title={term ? "Nothing matches" : "No customers"} description={term ? "No customer matches this search." : "Customers appear here once they are set up."} />}
          />
          <LoadMore shown={rows.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
        </div>
      )}
    </div>
  );
}
