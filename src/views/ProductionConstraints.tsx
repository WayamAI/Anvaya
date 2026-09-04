import StatusBadge from "@/components/StatusBadge";

const constraints = [
  { id: "C-001", type: "Material Shortage", resource: "Stearic Acid (RM-2087)", impact: "WO-2026-0849 — Dish Wash Liquid 500ml", severity: "high", startDate: "23 Mar 2026", resolution: "Emergency PO placed — ETA 1 Apr", status: "Open", owner: "Priya S." },
  { id: "C-002", type: "Machine Maintenance", resource: "Line 2 — Filling Machine", impact: "WO-2026-0852, WO-2026-0856 delayed by 2h", severity: "low", startDate: "26 Mar 2026", resolution: "Scheduled PM 06:00–08:00 — production resumes 08:00", status: "Scheduled", owner: "Karthik R." },
  { id: "C-003", type: "Capacity Overload", resource: "Line 3 — 28 Mar", impact: "WO-2026-0854 overlaps WO-2026-0851 by 4h", severity: "medium", startDate: "28 Mar 2026", resolution: "Reschedule WO-0854 to 29 Mar or split batch", status: "Open", owner: "Suresh P." },
  { id: "C-004", type: "Material Shortage", resource: "Fragrance Blend FG-04", impact: "WO-2026-0847 — Industrial Cleaner 5L", severity: "high", startDate: "24 Mar 2026", resolution: "Partial stock available — reduce batch to 1,200 units", status: "Mitigated", owner: "Anita D." },
  { id: "C-005", type: "Labour Shortage", resource: "Night shift — Pune Plant", impact: "All Line 4 orders delayed 4h", severity: "medium", startDate: "25 Mar 2026", resolution: "Cross-trained operators from Line 1 to cover", status: "Resolved", owner: "Ramesh T." },
  { id: "C-006", type: "Quality Hold", resource: "RM Batch RM-B-9055-0032 (Caustic Soda)", impact: "WO-2026-0857 — Phenyl White 5L on hold", severity: "high", startDate: "22 Mar 2026", resolution: "QC retest scheduled — results by 24 Mar", status: "Open", owner: "Mohan K." },
  { id: "C-007", type: "Utility Outage", resource: "Boiler #2 — Steam supply", impact: "All mixing operations Line 1 & 3", severity: "medium", startDate: "27 Mar 2026", resolution: "Backup boiler commissioned — 80% capacity", status: "Mitigated", owner: "Karthik R." },
];

const severityMap: Record<string, "red" | "amber" | "green"> = { high: "red", medium: "amber", low: "green" };
const statusMap: Record<string, "red" | "amber" | "green" | "blue" | "gray"> = { Open: "red", Mitigated: "amber", Scheduled: "blue", Resolved: "green" };

export default function ProductionConstraints() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Production Constraints</h2>
        <div className="flex gap-2">
          {[{ l: "Open", c: 3, s: "red" }, { l: "Mitigated", c: 2, s: "amber" }, { l: "Scheduled", c: 1, s: "blue" }, { l: "Resolved", c: 1, s: "green" }].map(b => (
            <span key={b.l} className="text-xs font-medium px-2 py-1 rounded-full bg-secondary">{b.l}: {b.c}</span>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-1">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["ID", "Type", "Resource", "Impact", "Severity", "Date", "Resolution", "Status", "Owner"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            )}
          </tr></thead>
          <tbody>
            {constraints.map((c, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30">
                <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                <td className="px-3 py-2 font-medium">{c.type}</td>
                <td className="px-3 py-2">{c.resource}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{c.impact}</td>
                <td className="px-3 py-2"><StatusBadge status={severityMap[c.severity]} label={c.severity} /></td>
                <td className="px-3 py-2">{c.startDate}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate">{c.resolution}</td>
                <td className="px-3 py-2"><StatusBadge status={statusMap[c.status]} label={c.status} /></td>
                <td className="px-3 py-2">{c.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
