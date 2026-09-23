import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";

const constraints = [
  { id: "C-001", type: "Material Shortage", resource: "Stearic Acid (RM-2087)", impact: "WO-2026-0849 — Dish Wash Liquid 500ml", severity: "high", startDate: "23 Mar 2026", resolution: "Emergency PO placed — ETA 1 Apr", status: "Open", owner: "Priya S." },
  { id: "C-002", type: "Machine Maintenance", resource: "Line 2 — Filling Machine", impact: "WO-2026-0852, WO-2026-0856 delayed by 2h", severity: "low", startDate: "26 Mar 2026", resolution: "Scheduled PM 06:00–08:00 — production resumes 08:00", status: "Scheduled", owner: "Karthik R." },
  { id: "C-003", type: "Capacity Overload", resource: "Line 3 — 28 Mar", impact: "WO-2026-0854 overlaps WO-2026-0851 by 4h", severity: "medium", startDate: "28 Mar 2026", resolution: "Reschedule WO-0854 to 29 Mar or split batch", status: "Open", owner: "Suresh P." },
  { id: "C-004", type: "Material Shortage", resource: "Fragrance Blend FG-04", impact: "WO-2026-0847 — Industrial Cleaner 5L", severity: "high", startDate: "24 Mar 2026", resolution: "Partial stock available — reduce batch to 1,200 units", status: "Mitigated", owner: "Anita D." },
  { id: "C-005", type: "Labour Shortage", resource: "Night shift — Pune Plant", impact: "All Line 4 orders delayed 4h", severity: "medium", startDate: "25 Mar 2026", resolution: "Cross-trained operators from Line 1 to cover", status: "Resolved", owner: "Ramesh T." },
  { id: "C-006", type: "Quality Hold", resource: "RM Batch RM-B-9055-0032 (Caustic Soda)", impact: "WO-2026-0857 — Phenyl White 5L on hold", severity: "high", startDate: "22 Mar 2026", resolution: "QC retest scheduled — results by 24 Mar", status: "Open", owner: "Mohan K." },
  { id: "C-007", type: "Utility Outage", resource: "Boiler #2 — Steam supply", impact: "All mixing operations Line 1 & 3", severity: "medium", startDate: "27 Mar 2026", resolution: "Backup boiler commissioned — 80% capacity", status: "Mitigated", owner: "Karthik R." },
];

const severityDot: Record<string, string> = { high: "bg-danger", medium: "bg-warning", low: "bg-success" };
const statusMap: Record<string, "red" | "amber" | "green" | "blue" | "gray"> = { Open: "red", Mitigated: "amber", Scheduled: "blue", Resolved: "green" };

type Constraint = (typeof constraints)[number];

export default function ProductionConstraints() {
  const counts = constraints.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const columns: Column<Constraint>[] = [
    { key: "id", header: "ID", width: "w-[80px]", value: c => c.id, cell: c => <span className="identifier text-body-sm">{c.id}</span> },
    {
      key: "type", header: "Type", width: "w-[180px]",
      value: c => c.type,
      // Severity reads as a dot on the type rather than a second badge per row.
      cell: c => (
        <span className="flex items-center gap-2">
          <span title={`${c.severity} severity`} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDot[c.severity]}`} />
          <span className="font-medium">{c.type}</span>
        </span>
      ),
    },
    { key: "resource", header: "Resource", value: c => c.resource, cell: c => c.resource },
    { key: "impact", header: "Impact", value: c => c.impact, cell: c => <span className="block max-w-[220px] truncate text-muted-foreground">{c.impact}</span> },
    { key: "date", header: "Date", width: "w-[120px]", value: c => c.startDate, cell: c => <span className="whitespace-nowrap">{c.startDate}</span> },
    { key: "resolution", header: "Resolution", value: c => c.resolution, cell: c => <span className="block max-w-[240px] truncate text-muted-foreground">{c.resolution}</span> },
    { key: "status", header: "Status", width: "w-[120px]", value: c => c.status, cell: c => <StatusBadge status={statusMap[c.status]} label={c.status} /> },
    { key: "owner", header: "Owner", width: "w-[110px]", value: c => c.owner, cell: c => c.owner },
  ];

  return (
    <div className="px-6 py-5">
      <PageHeader
        title="Production constraints"
        description={["Open", "Mitigated", "Scheduled", "Resolved"]
          .filter(s => counts[s])
          .map(s => `${counts[s]} ${s.toLowerCase()}`)
          .join(" · ")}
      />
      <DataTable
        columns={columns}
        rows={constraints}
        rowKey={c => c.id}
        name="Production constraints"
        searchable
        exportable
        empty={<EmptyState title="No constraints" description="Nothing is currently blocking production." />}
      />
    </div>
  );
}
