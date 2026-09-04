import { useState } from "react";


const savedReports = [
  { name: "Weekly Stock Coverage Report", type: "Inventory", schedule: "Every Monday 06:00", lastRun: "17 Mar 2026", format: "Excel", rows: "1,247" },
  { name: "Monthly Procurement Summary", type: "Purchase", schedule: "1st of month", lastRun: "1 Mar 2026", format: "PDF", rows: "412" },
  { name: "Vendor Performance Scorecard", type: "Vendor", schedule: "Monthly", lastRun: "1 Mar 2026", format: "Excel", rows: "48" },
  { name: "MRP Exception Analysis", type: "Planning", schedule: "Daily 07:00", lastRun: "23 Mar 2026", format: "Excel", rows: "312" },
  { name: "Production Efficiency Report", type: "Production", schedule: "Weekly", lastRun: "17 Mar 2026", format: "PDF", rows: "234" },
  { name: "Dead Stock Valuation", type: "Inventory", schedule: "Monthly", lastRun: "1 Mar 2026", format: "Excel", rows: "89" },
  { name: "Batch Traceability Audit", type: "Quality", schedule: "On demand", lastRun: "15 Mar 2026", format: "PDF", rows: "156" },
  { name: "Cost Variance Analysis", type: "Finance", schedule: "Monthly", lastRun: "1 Mar 2026", format: "Excel", rows: "847" },
];

const templates = [
  { name: "Inventory Valuation", desc: "Stock value by category, warehouse, and material with ABC classification", fields: 12 },
  { name: "Purchase Order Aging", desc: "Open POs sorted by age with vendor-wise overdue analysis", fields: 10 },
  { name: "Material Consumption", desc: "Actual vs planned consumption with variance analysis", fields: 14 },
  { name: "Supplier Lead Time Analysis", desc: "Promised vs actual delivery dates with trend", fields: 8 },
  { name: "Production Yield Report", desc: "Input vs output quantities with waste percentage", fields: 11 },
  { name: "Safety Stock Review", desc: "Current vs recommended safety stock with optimization suggestions", fields: 15 },
];

export default function CustomReports() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Custom Reports</h2>

      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-1">
            <h3 className="text-sm font-semibold px-4 pt-4 mb-2">Saved Reports</h3>
            <table className="w-full text-[13px]">
              <thead><tr className="bg-secondary/50 border-b border-border">
                {["Report Name", "Type", "Schedule", "Last Run", "Format", "Rows"].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {savedReports.map((r, i) => (
                  <tr key={i} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                    <td className="px-3 py-2 text-xs">{r.schedule}</td>
                    <td className="px-3 py-2">{r.lastRun}</td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-secondary rounded text-xs">{r.format}</span></td>
                    <td className="px-3 py-2 tabular-nums">{r.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
          <h3 className="text-sm font-semibold mb-3">Report Templates</h3>
          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={i} className="p-3 rounded-md bg-secondary/50 border border-border hover:bg-secondary transition-colors cursor-pointer">
                <div className="text-sm font-medium">{t.name}</div>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                <div className="text-[10px] text-muted-foreground mt-1">{t.fields} configurable fields</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
