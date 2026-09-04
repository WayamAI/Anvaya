import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";

const orders = [
  { wo: "WO-2026-0847", product: "Industrial Cleaner 5L", batch: "2,000", start: "24 Mar, 08:00", end: "24 Mar, 16:00", line: "Line 3", material: "green" as const, status: "Confirmed" },
  { wo: "WO-2026-0848", product: "Floor Polish 1L", batch: "5,000", start: "24 Mar, 09:00", end: "25 Mar, 12:00", line: "Line 1", material: "amber" as const, status: "Confirmed" },
  { wo: "WO-2026-0849", product: "Dish Wash Liquid 500ml", batch: "8,000", start: "25 Mar, 08:00", end: "25 Mar, 14:00", line: "Line 2", material: "red" as const, status: "At Risk" },
  { wo: "WO-2026-0850", product: "Hand Wash 250ml", batch: "10,000", start: "25 Mar, 07:00", end: "25 Mar, 18:00", line: "Line 4", material: "green" as const, status: "Confirmed" },
  { wo: "WO-2026-0851", product: "Glass Cleaner 1L", batch: "3,000", start: "26 Mar, 08:00", end: "26 Mar, 15:00", line: "Line 3", material: "green" as const, status: "Planned" },
  { wo: "WO-2026-0852", product: "Toilet Cleaner 500ml", batch: "6,000", start: "27 Mar, 08:00", end: "27 Mar, 16:00", line: "Line 2", material: "amber" as const, status: "Planned" },
  { wo: "WO-2026-0853", product: "Surface Disinfectant 5L", batch: "1,500", start: "28 Mar, 08:00", end: "28 Mar, 14:00", line: "Line 1", material: "green" as const, status: "Planned" },
  { wo: "WO-2026-0854", product: "Multi-Surface Cleaner 1L", batch: "4,000", start: "28 Mar, 09:00", end: "29 Mar, 11:00", line: "Line 3", material: "green" as const, status: "Planned" },
  { wo: "WO-2026-0855", product: "Fabric Softener 1L", batch: "3,500", start: "29 Mar, 08:00", end: "29 Mar, 16:00", line: "Line 4", material: "amber" as const, status: "Planned" },
  { wo: "WO-2026-0856", product: "Bathroom Cleaner 500ml", batch: "7,000", start: "30 Mar, 08:00", end: "30 Mar, 15:00", line: "Line 2", material: "green" as const, status: "Planned" },
];

const ganttLines = [
  { name: "Line 1", orders: [
    { product: "Floor Polish", start: 0, width: 35, color: "bg-primary" },
    { product: "Surface Disinfectant", start: 55, width: 20, color: "bg-primary/70" },
  ]},
  { name: "Line 2", orders: [
    { product: "Dish Wash", start: 15, width: 15, color: "bg-destructive" },
    { product: "Toilet Cleaner", start: 45, width: 20, color: "bg-primary/50" },
    { product: "Bathroom Cleaner", start: 80, width: 15, color: "bg-primary/80" },
  ]},
  { name: "Line 3", orders: [
    { product: "Industrial Cleaner", start: 0, width: 20, color: "bg-primary/60" },
    { product: "Glass Cleaner", start: 30, width: 18, color: "bg-primary/90" },
    { product: "Multi-Surface", start: 55, width: 25, color: "bg-primary/40" },
  ]},
  { name: "Line 4", orders: [
    { product: "Hand Wash", start: 15, width: 28, color: "bg-primary/70" },
    { product: "Fabric Softener", start: 70, width: 20, color: "bg-primary/50" },
  ]},
];

const constraints = [
  { type: "Material Shortage", desc: "Stearic Acid — 320 kg shortfall for WO-0849", severity: "High" },
  { type: "Maintenance", desc: "Line 2 preventive maintenance — 26 Mar, 06:00–08:00", severity: "Low" },
  { type: "Capacity Overload", desc: "Line 3 over-scheduled on 28 Mar (110% capacity)", severity: "Medium" },
];

export default function ProductionSchedule() {
  const [view, setView] = useState<"gantt" | "list">("gantt");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Production Schedule</h2>
          <span className="text-xs text-muted-foreground">Last updated: 2 minutes ago</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-secondary rounded-lg p-0.5">
            <button onClick={() => setView("gantt")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === "gantt" ? "bg-card shadow-sm" : ""}`}>Gantt</button>
            <button onClick={() => setView("list")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === "list" ? "bg-card shadow-sm" : ""}`}>List</button>
          </div>
          <button className="h-8 px-3 bg-card border border-border rounded-md text-xs font-medium hover:bg-secondary">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3">
          {view === "gantt" ? (
            <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
              <div className="flex mb-3">
                <div className="w-20" />
                <div className="flex-1 flex text-[10px] text-muted-foreground">
                  {["24 Mar", "25 Mar", "26 Mar", "27 Mar", "28 Mar", "29 Mar", "30 Mar"].map((d) => (
                    <div key={d} className="flex-1 border-l border-border pl-1">{d}</div>
                  ))}
                </div>
              </div>
              {ganttLines.map((line) => (
                <div key={line.name} className="flex items-center mb-2">
                  <div className="w-20 text-xs font-medium text-muted-foreground">{line.name}</div>
                  <div className="flex-1 h-8 bg-secondary/50 rounded relative">
                    {line.orders.map((o, i) => (
                      <div
                        key={i}
                        className={`absolute top-1 h-6 rounded ${o.color} flex items-center px-1.5 text-[10px] font-medium text-primary-foreground truncate`}
                        style={{ left: `${o.start}%`, width: `${o.width}%` }}
                        title={o.product}
                      >
                        {o.product}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-secondary/50 border-b border-border">
                    {["Work Order", "Product", "Batch Size", "Start", "End", "Line", "Material", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => (
                    <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs">{o.wo}</td>
                      <td className="px-3 py-2 font-medium">{o.product}</td>
                      <td className="px-3 py-2 tabular-nums">{o.batch}</td>
                      <td className="px-3 py-2">{o.start}</td>
                      <td className="px-3 py-2">{o.end}</td>
                      <td className="px-3 py-2">{o.line}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${o.material === "green" ? "bg-primary" : o.material === "amber" ? "bg-primary/50" : "bg-destructive"}`} />
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={o.status === "Confirmed" ? "green" : o.status === "At Risk" ? "red" : "blue"} label={o.status} /></td>
                      <td className="px-3 py-2"><button className="text-xs text-accent hover:underline">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Constraints Panel */}
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-1">
          <h3 className="text-sm font-semibold mb-3">Active Constraints (3)</h3>
          <div className="space-y-3">
            {constraints.map((c, i) => (
              <div key={i} className="p-2.5 rounded-md bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{c.type}</span>
                  <StatusBadge status={c.severity === "High" ? "red" : c.severity === "Medium" ? "amber" : "green"} label={c.severity} />
                </div>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
