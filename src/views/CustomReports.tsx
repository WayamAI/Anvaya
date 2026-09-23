import { useState } from "react";
import { PageIcon } from "@/components/app/page-icon";


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
  { name: "Inventory Valuation", icon: "inventory-valuation", desc: "Stock value by category, warehouse, and material with ABC classification", fields: 12 },
  { name: "Purchase Order Aging", icon: "purchase-order-aging", desc: "Open POs sorted by age with vendor-wise overdue analysis", fields: 10 },
  { name: "Material Consumption", icon: "material-consumption", desc: "Actual vs planned consumption with variance analysis", fields: 14 },
  { name: "Supplier Lead Time Analysis", icon: "supplier-lead-time", desc: "Promised vs actual delivery dates with trend", fields: 8 },
  { name: "Production Yield Report", icon: "production-yield", desc: "Input vs output quantities with waste percentage", fields: 11 },
  { name: "Safety Stock Review", icon: "safety-stock-review", desc: "Current vs recommended safety stock with optimization suggestions", fields: 15 },
];

export default function CustomReports() {
  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Custom reports</span>
        </h1>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="overflow-x-auto">
            <h3 className="text-body-md font-semibold px-4 pt-4 mb-2">Saved reports</h3>
            <div className="overflow-x-auto">
              <table className="data-table w-full text-body-md">
                <thead><tr className="border-b border-border">
                  {["Report name", "Type", "Schedule", "Last run", "Format", "Rows"].map(h =>
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
                </tr></thead>
                <tbody>
                  {savedReports.map((r, i) => (
                    <tr key={i} className="border-b border-border hover:bg-sunken">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                      <td className="px-3 py-2 text-body-sm">{r.schedule}</td>
                      <td className="px-3 py-2">{r.lastRun}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-secondary rounded text-body-sm">{r.format}</span></td>
                      <td className="px-3 py-2 tabular-nums">{r.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-body-md font-semibold mb-3">Report templates</h3>
          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-colors cursor-pointer">
                {/* Icon sits on the name's own line, so the card keeps the
                    height and padding it already had. */}
                <div className="flex items-center gap-2">
                  <img
                    src={`/icons/reports/${t.icon}.png`}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="block h-6 w-6 shrink-0 object-contain"
                  />
                  <div className="min-w-0 text-body-md font-medium">{t.name}</div>
                </div>
                <p className="text-body-sm text-muted-foreground mt-1">{t.desc}</p>
                <div className="text-caption text-muted-foreground mt-1">{t.fields} configurable fields</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
