import { useState } from "react";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { MaterialIcon } from "@/components/app/material-icon";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageIcon } from "@/components/app/page-icon";

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

type StockRow = (typeof stockData)[number];

const statusLabel = (s: StockRow["status"]) =>
  s === "green" ? "Adequate" : s === "amber" ? "Low" : "Critical";

export default function StockOverview() {
  const [wh, setWh] = useState("All Locations");

  const columns: Column<StockRow>[] = [
    { key: "code", header: "Code", width: "w-[96px]", value: s => s.code, cell: s => <span className="identifier text-body-sm">{s.code}</span> },
    {
      key: "name", header: "Material", value: s => s.name,
      // The glyph rides with the name rather than taking a column of its own,
      // so the column count and every header stay as they were.
      cell: s => (
        <span className="flex items-center gap-2">
          <MaterialIcon code={s.code} />
          <span className="truncate">{s.name}</span>
        </span>
      ),
    },
    { key: "cat", header: "Category", width: "w-[110px]", value: s => s.cat, cell: s => <span className="text-muted-foreground">{s.cat}</span> },
    { key: "uom", header: "UOM", width: "w-[70px]", value: s => s.uom, cell: s => s.uom },
    { key: "pune", header: "Stock (Pune)", align: "right", numeric: true, width: "w-[120px]", value: s => s.pune, cell: s => s.pune.toLocaleString() },
    { key: "mumbai", header: "Stock (Mumbai)", align: "right", numeric: true, width: "w-[130px]", value: s => s.mumbai, cell: s => s.mumbai.toLocaleString() },
    { key: "total", header: "Total", align: "right", numeric: true, width: "w-[100px]", value: s => s.total, cell: s => <span className="font-medium">{s.total.toLocaleString()}</span> },
    { key: "rop", header: "Reorder pt", align: "right", numeric: true, width: "w-[110px]", value: s => s.rop, cell: s => s.rop.toLocaleString() },
    { key: "ss", header: "Safety stock", align: "right", numeric: true, width: "w-[120px]", value: s => s.ss, cell: s => s.ss.toLocaleString() },
    { key: "avgCost", header: "Avg cost", align: "right", numeric: true, width: "w-[100px]", value: s => s.avgCost, cell: s => `₹${s.avgCost}` },
    { key: "value", header: "Value (₹L)", align: "right", numeric: true, width: "w-[110px]", value: s => s.value, cell: s => `₹${s.value.toFixed(2)}L` },
    { key: "status", header: "Status", width: "w-[110px]", value: s => statusLabel(s.status), cell: s => <StatusBadge status={s.status} label={statusLabel(s.status)} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Stock overview</span>
        </h1>
      </div>

      <div className="flex gap-1">
        {warehouses.map((w) => (
          <button key={w} onClick={() => setWh(w)} className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${wh === w ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
            {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total SKUs" value="1,247" iconName="total-skus" />
        <KPICard title="Total stock value" value="₹8.4 Cr" iconName="stock-value" />
        <KPICard title="Below reorder point" value="34" iconName="below-reorder-point" status="red" />
        <KPICard title="Dead stock (>90d)" value="89 SKUs" subtitle="₹0.62 Cr" iconName="dead-stock" status="amber" />
      </div>

      <div>
        <DataTable
          columns={columns}
          rows={stockData}
          rowKey={s => s.code}
          name="Stock overview"
          searchable
          columnToggle
          exportable
          pageSize={25}
        />
      </div>
    </div>
  );
}
