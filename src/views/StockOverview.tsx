import { useState } from "react";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { Package, AlertTriangle, Archive, Box } from "lucide-react";

const warehouses = ["All Locations", "Pune Plant", "Mumbai Warehouse", "Delhi Depot", "Chennai Hub"];

const stockData = [
  { code: "RM-1042", name: "Polypropylene Granules", cat: "Polymer", uom: "KG", pune: 4200, mumbai: 1800, total: 6000, rop: 3000, ss: 500, avgCost: 82, value: 4.92, status: "green" as const },
  { code: "RM-2087", name: "Stearic Acid", cat: "Chemical", uom: "KG", pune: 180, mumbai: 0, total: 180, rop: 500, ss: 100, avgCost: 145, value: 0.26, status: "red" as const },
  { code: "RM-3011", name: "HDPE Resin", cat: "Polymer", uom: "KG", pune: 6200, mumbai: 3600, total: 9800, rop: 4000, ss: 800, avgCost: 78, value: 7.64, status: "green" as const },
  { code: "RM-4023", name: "Sodium Lauryl Sulphate", cat: "Chemical", uom: "KG", pune: 1050, mumbai: 400, total: 1450, rop: 800, ss: 200, avgCost: 185, value: 2.68, status: "amber" as const },
  { code: "RM-5018", name: "EDTA Disodium Salt", cat: "Chemical", uom: "KG", pune: 95, mumbai: 0, total: 95, rop: 200, ss: 50, avgCost: 420, value: 0.40, status: "red" as const },
  { code: "RM-6031", name: "Titanium Dioxide", cat: "Pigment", uom: "KG", pune: 440, mumbai: 200, total: 640, rop: 500, ss: 150, avgCost: 320, value: 2.05, status: "amber" as const },
  { code: "RM-7044", name: "Demineralised Water", cat: "Utility", uom: "L", pune: 8000, mumbai: 4000, total: 12000, rop: 5000, ss: 2000, avgCost: 2, value: 0.24, status: "green" as const },
  { code: "RM-8012", name: "Fragrance Blend FG-04", cat: "Fragrance", uom: "L", pune: 12, mumbai: 10, total: 22, rop: 40, ss: 10, avgCost: 2800, value: 0.62, status: "red" as const },
  { code: "RM-9055", name: "Caustic Soda Flakes", cat: "Chemical", uom: "KG", pune: 1800, mumbai: 1000, total: 2800, rop: 1200, ss: 300, avgCost: 38, value: 1.06, status: "green" as const },
  { code: "RM-1066", name: "Citric Acid Monohydrate", cat: "Chemical", uom: "KG", pune: 280, mumbai: 100, total: 380, rop: 300, ss: 80, avgCost: 110, value: 0.42, status: "amber" as const },
  { code: "RM-1177", name: "Isopropyl Alcohol", cat: "Solvent", uom: "L", pune: 300, mumbai: 150, total: 450, rop: 200, ss: 100, avgCost: 95, value: 0.43, status: "green" as const },
  { code: "PM-1001", name: "HDPE Bottle 5L", cat: "Packaging", uom: "PCS", pune: 5200, mumbai: 3000, total: 8200, rop: 5000, ss: 1000, avgCost: 42, value: 3.44, status: "green" as const },
  { code: "PM-1002", name: "Shrink Labels (Type A)", cat: "Packaging", uom: "PCS", pune: 3000, mumbai: 1500, total: 4500, rop: 3000, ss: 500, avgCost: 3.5, value: 0.16, status: "amber" as const },
  { code: "PM-2003", name: "Foil Seals 5L", cat: "Packaging", uom: "PCS", pune: 2200, mumbai: 1200, total: 3400, rop: 2000, ss: 500, avgCost: 1.8, value: 0.06, status: "green" as const },
  { code: "RM-2101", name: "Coconut Diethanolamide", cat: "Chemical", uom: "KG", pune: 210, mumbai: 100, total: 310, rop: 150, ss: 60, avgCost: 240, value: 0.74, status: "green" as const },
  { code: "RM-2205", name: "Glycerine IP", cat: "Chemical", uom: "L", pune: 340, mumbai: 180, total: 520, rop: 250, ss: 80, avgCost: 85, value: 0.44, status: "green" as const },
  { code: "RM-3310", name: "Sodium Hypochlorite", cat: "Chemical", uom: "L", pune: 480, mumbai: 200, total: 680, rop: 400, ss: 100, avgCost: 22, value: 0.15, status: "amber" as const },
  { code: "RM-4401", name: "Pine Oil", cat: "Essential Oil", uom: "L", pune: 30, mumbai: 15, total: 45, rop: 30, ss: 10, avgCost: 650, value: 0.29, status: "amber" as const },
  { code: "PM-3004", name: "Corrugated Cartons (5Lx6)", cat: "Packaging", uom: "PCS", pune: 1200, mumbai: 600, total: 1800, rop: 800, ss: 200, avgCost: 28, value: 0.50, status: "green" as const },
  { code: "PM-2008", name: "Shrink Labels (Type B)", cat: "Packaging", uom: "PCS", pune: 800, mumbai: 400, total: 1200, rop: 2000, ss: 300, avgCost: 3.2, value: 0.04, status: "red" as const },
];

export default function StockOverview() {
  const [wh, setWh] = useState("All Locations");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Stock Overview</h2>
      </div>

      <div className="flex gap-1 animate-fade-in-up stagger-1">
        {warehouses.map((w) => (
          <button key={w} onClick={() => setWh(w)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${wh === w ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
            {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-2">
        <KPICard title="Total SKUs" value="1,247" icon={Package} status="green" />
        <KPICard title="Total Stock Value" value="₹8.4 Cr" icon={Box} status="green" />
        <KPICard title="Below Reorder Point" value="34" icon={AlertTriangle} status="red" />
        <KPICard title="Dead Stock (>90d)" value="89 SKUs" subtitle="₹0.62 Cr" icon={Archive} status="amber" />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                {["Code", "Material", "Category", "UOM", "Stock (Pune)", "Stock (Mumbai)", "Total", "Reorder Pt", "Safety Stock", "Avg Cost", "Value (₹L)", "Status"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockData.map((s, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer">
                  <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.cat}</td>
                  <td className="px-3 py-2">{s.uom}</td>
                  <td className="px-3 py-2 tabular-nums">{s.pune.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{s.mumbai.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{s.total.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{s.rop.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{s.ss.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">₹{s.avgCost}</td>
                  <td className="px-3 py-2 tabular-nums">₹{s.value.toFixed(2)}L</td>
                  <td className="px-3 py-2"><StatusBadge status={s.status} label={s.status === "green" ? "Adequate" : s.status === "amber" ? "Low" : "Critical"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
