import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { LoadMore } from "@/components/app/load-more";
import { btnSecondary, selectSm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { inrCompact } from "@/lib/format";
import { useDebounced, usePagedQuery } from "@/lib/use-paged-query";
import type { VendorDetail } from "@/server/services/trace-lookup.service";
import { VendorFormButton, VendorMaterialFormButton } from "@/components/masterdata/master-forms";

/**
 * Vendors on file: approved-supplier status, payment terms, the materials each
 * is set up to supply, and the latest quality scorecard.
 */

interface VendorRow {
  id: string; code: string; name: string; city: string | null; paymentTerms: string | null; isApproved: boolean; isActive: boolean;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground block">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function VendorPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["vendor", id], queryFn: ({ signal }) => apiGet<VendorDetail>(`/vendors/${id}`, undefined, { signal }) });
  if (q.isPending) return <div className="surface-panel p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}</div>;
  if (q.error) {
    return (
      <div className="surface-panel">
        <EmptyState title="Vendor could not be loaded" description={q.error.message} action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      </div>
    );
  }
  const v = q.data;
  const sc = v.scorecard;
  return (
    <div className="surface-panel p-4 space-y-4">
      <h3 className="text-body-md font-semibold flex flex-wrap items-center gap-2">
        {v.name} <span className="identifier text-muted-foreground font-normal">{v.code}</span>
        <StatusBadge status={v.isApproved ? "green" : "amber"} label={v.isApproved ? "Approved supplier" : "Not on ASL"} />
        {!v.isActive && <StatusBadge status="gray" label="Inactive" />}
        <span className="ml-auto"><VendorFormButton vendor={v} /></span>
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-body-sm">
        <Fact label="Location">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</Fact>
        <Fact label="Contact">{v.contactPerson ?? "—"}{v.contactEmail && <span className="block font-normal text-muted-foreground">{v.contactEmail}</span>}</Fact>
        <Fact label="Payment terms">{v.paymentTerms ?? "—"}</Fact>
        <Fact label="Vendor's code for us">{v.vendorCode ?? "—"}</Fact>
      </div>

      <div>
        <span className="text-body-sm text-muted-foreground font-medium">Quality scorecard</span>
        {sc ? (
          <div className="mt-1 grid grid-cols-2 lg:grid-cols-5 gap-3 text-body-sm">
            <Fact label="Period">{fmtDate(sc.periodStart)} – {fmtDate(sc.periodEnd)}</Fact>
            <Fact label="On-time delivery"><span className={sc.onTimeDeliveryPercent < 90 ? "text-danger" : ""}>{sc.onTimeDeliveryPercent}%</span></Fact>
            <Fact label="Defect rate"><span className={sc.defectRatePercent > 2 ? "text-danger" : ""}>{sc.defectRatePercent}%</span></Fact>
            <Fact label="Cost of poor quality">{inrCompact(sc.copqAmount)}</Fact>
            <Fact label="Last audit">{sc.lastAuditDate ? `${fmtDate(sc.lastAuditDate)}${sc.auditResult ? ` · ${sc.auditResult.toLowerCase()}` : ""}` : "None recorded"}</Fact>
          </div>
        ) : <div className="mt-1 text-body-sm text-muted-foreground">No scorecard recorded yet.</div>}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm text-muted-foreground font-medium">Materials supplied ({v.approvedMaterials.length})</span>
          <VendorMaterialFormButton vendorId={v.id} />
        </div>
        {v.approvedMaterials.length ? (
          <table className="data-table mt-1 w-full text-body-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 font-medium">Material</th><th className="py-1.5 font-medium text-right">Price</th>
              <th className="py-1.5 font-medium text-right">Lead time</th><th className="py-1.5 font-medium text-right">Min / multiple</th>
              <th className="py-1.5 font-medium">Source</th><th className="py-1.5" />
            </tr></thead>
            <tbody>
              {v.approvedMaterials.map((m) => (
                <tr key={m.materialId} className="border-b border-border last:border-0">
                  <td className="py-1.5"><span className="identifier text-muted-foreground">{m.code}</span> {m.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.unitPrice === null ? "—" : `₹${m.unitPrice.toLocaleString("en-IN")}`}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.leadTimeDays} d</td>
                  <td className="py-1.5 text-right tabular-nums">{m.minOrderQty ?? 0} / {m.orderMultiple ?? 0}</td>
                  <td className="py-1.5">{m.isPreferred ? "Preferred" : "Alternate"}</td>
                  <td className="py-1.5 text-right"><VendorMaterialFormButton vendorId={v.id} item={m} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="mt-1 text-body-sm text-muted-foreground">None set up.</p>}
      </div>
    </div>
  );
}

export default function VendorManagement() {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [active, setActive] = useState<"true" | "false" | "all">("true");
  const [selected, setSelected] = useState<string | null>(null);

  const q = usePagedQuery<VendorRow[]>(["vendors"], "/vendors", { q: term || undefined, active });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.meta?.total;

  const columns: Column<VendorRow>[] = [
    { key: "code", header: "Code", width: "w-[110px]", value: (v) => v.code, cell: (v) => <span className="identifier text-body-sm">{v.code}</span> },
    { key: "name", header: "Vendor", value: (v) => v.name, cell: (v) => <span className="font-medium">{v.name}</span> },
    { key: "city", header: "City", width: "w-[140px]", value: (v) => v.city ?? "", cell: (v) => v.city ?? "—" },
    { key: "terms", header: "Payment terms", width: "w-[150px]", value: (v) => v.paymentTerms ?? "", cell: (v) => v.paymentTerms ?? "—" },
    {
      key: "asl", header: "Status", width: "w-[160px]", value: (v) => (v.isApproved ? 1 : 0),
      cell: (v) => !v.isActive ? <StatusBadge status="gray" label="Inactive" /> : <StatusBadge status={v.isApproved ? "green" : "amber"} label={v.isApproved ? "Approved" : "Not on ASL"} />,
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Vendor management</span>
        </h1>
        <div className="flex items-center gap-2">
        <select className={cn(selectSm, "w-auto")} value={active} onChange={(e) => setActive(e.target.value as typeof active)} aria-label="Show">
          <option value="true">Active vendors</option>
          <option value="false">Inactive vendors</option>
          <option value="all">All vendors</option>
        </select>
        <VendorFormButton onSaved={setSelected} />
        </div>
      </div>

      {q.error ? (
        <EmptyState title="Vendors could not be loaded" description={q.error.message} action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
      ) : (
        <div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(v) => v.id}
            name="Vendors"
            loading={q.isPending}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            exportable
            pageSize={25}
            onRowClick={(v) => setSelected(v.id)}
            isRowSelected={(v) => v.id === selected}
            empty={<EmptyState title={term ? "Nothing matches" : "No vendors"} description={term ? "No vendor matches this search." : "Vendors appear here once they are set up."} />}
          />
          <LoadMore shown={rows.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
        </div>
      )}

      {selected ? <VendorPanel key={selected} id={selected} /> : !q.error && rows.length > 0 && (
        <p className="text-body-sm text-muted-foreground">Select a vendor for its scorecard and the materials it supplies.</p>
      )}
    </div>
  );
}
