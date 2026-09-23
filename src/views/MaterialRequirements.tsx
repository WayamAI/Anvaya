import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";

import { selectSm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
const materials = [
  { code: "RM-1042", name: "Polypropylene Granules", category: "Polymer", opening: "4,200 kg", gross: "8,400 kg", scheduled: "3,000 kg", net: "1,200 kg", safety: "500 kg", reorder: "5,000 kg", coverage: 15, status: "amber" as const },
  { code: "RM-2087", name: "Stearic Acid", category: "Chemical", opening: "180 kg", gross: "620 kg", scheduled: "0 kg", net: "440 kg", safety: "100 kg", reorder: "500 kg", coverage: 4, status: "red" as const },
  { code: "RM-3011", name: "HDPE Resin", category: "Polymer", opening: "9,800 kg", gross: "7,200 kg", scheduled: "9,000 kg", net: "0 kg", safety: "800 kg", reorder: "0 kg", coverage: 38, status: "green" as const },
  { code: "RM-4023", name: "Sodium Lauryl Sulphate", category: "Chemical", opening: "1,450 kg", gross: "2,100 kg", scheduled: "800 kg", net: "850 kg", safety: "200 kg", reorder: "1,000 kg", coverage: 12, status: "amber" as const },
  { code: "RM-5018", name: "EDTA Disodium Salt", category: "Chemical", opening: "95 kg", gross: "420 kg", scheduled: "0 kg", net: "325 kg", safety: "50 kg", reorder: "400 kg", coverage: 5, status: "red" as const },
  { code: "RM-6031", name: "Titanium Dioxide", category: "Pigment", opening: "640 kg", gross: "1,200 kg", scheduled: "500 kg", net: "60 kg", safety: "150 kg", reorder: "800 kg", coverage: 8, status: "amber" as const },
  { code: "RM-7044", name: "Demineralised Water", category: "Utility", opening: "12,000 L", gross: "18,000 L", scheduled: "15,000 L", net: "0 L", safety: "2,000 L", reorder: "0 L", coverage: 45, status: "green" as const },
  { code: "RM-8012", name: "Fragrance Blend FG-04", category: "Fragrance", opening: "22 L", gross: "85 L", scheduled: "0 L", net: "63 L", safety: "10 L", reorder: "100 L", coverage: 3, status: "red" as const },
  { code: "RM-9055", name: "Caustic Soda Flakes", category: "Chemical", opening: "2,800 kg", gross: "3,200 kg", scheduled: "1,500 kg", net: "0 kg", safety: "300 kg", reorder: "0 kg", coverage: 22, status: "green" as const },
  { code: "RM-1066", name: "Citric Acid Monohydrate", category: "Chemical", opening: "380 kg", gross: "600 kg", scheduled: "200 kg", net: "20 kg", safety: "80 kg", reorder: "400 kg", coverage: 11, status: "amber" as const },
  { code: "RM-1177", name: "Isopropyl Alcohol", category: "Solvent", opening: "450 L", gross: "800 L", scheduled: "400 L", net: "0 L", safety: "100 L", reorder: "0 L", coverage: 16, status: "green" as const },
  { code: "PM-1001", name: "HDPE Bottle 5L", category: "Packaging", opening: "8,200 pcs", gross: "12,000 pcs", scheduled: "10,000 pcs", net: "0 pcs", safety: "1,000 pcs", reorder: "0 pcs", coverage: 28, status: "green" as const },
  { code: "PM-1002", name: "Shrink Labels (Type A)", category: "Packaging", opening: "4,500 pcs", gross: "8,000 pcs", scheduled: "0 pcs", net: "3,500 pcs", safety: "500 pcs", reorder: "10,000 pcs", coverage: 9, status: "amber" as const },
  { code: "PM-2003", name: "Foil Seals 5L", category: "Packaging", opening: "3,400 pcs", gross: "6,000 pcs", scheduled: "5,000 pcs", net: "0 pcs", safety: "500 pcs", reorder: "0 pcs", coverage: 18, status: "green" as const },
  { code: "PM-2008", name: "Shrink Labels (Type B)", category: "Packaging", opening: "1,200 pcs", gross: "3,500 pcs", scheduled: "0 pcs", net: "2,300 pcs", safety: "300 pcs", reorder: "5,000 pcs", coverage: 6, status: "red" as const },
  { code: "RM-2101", name: "Coconut Diethanolamide", category: "Chemical", opening: "310 kg", gross: "450 kg", scheduled: "200 kg", net: "0 kg", safety: "60 kg", reorder: "0 kg", coverage: 19, status: "green" as const },
  { code: "RM-2205", name: "Glycerine IP", category: "Chemical", opening: "520 L", gross: "680 L", scheduled: "300 L", net: "0 L", safety: "80 L", reorder: "0 L", coverage: 24, status: "green" as const },
  { code: "PM-3004", name: "Corrugated Cartons (5L x6)", category: "Packaging", opening: "1,800 pcs", gross: "4,000 pcs", scheduled: "5,000 pcs", net: "0 pcs", safety: "200 pcs", reorder: "0 pcs", coverage: 32, status: "green" as const },
  { code: "RM-3310", name: "Sodium Hypochlorite", category: "Chemical", opening: "680 L", gross: "1,100 L", scheduled: "0 L", net: "420 L", safety: "100 L", reorder: "1,000 L", coverage: 10, status: "amber" as const },
  { code: "RM-4401", name: "Pine Oil", category: "Essential Oil", opening: "45 L", gross: "120 L", scheduled: "80 L", net: "0 L", safety: "10 L", reorder: "0 L", coverage: 14, status: "amber" as const },
];

type MrRow = (typeof materials)[number];

const mrStatusLabel = (s: MrRow["status"]) =>
  s === "green" ? "Adequate" : s === "amber" ? "Low" : "Critical";

export default function MaterialRequirements() {
  const [showShortages, setShowShortages] = useState(false);
  const filtered = showShortages ? materials.filter((m) => m.status === "red" || m.status === "amber") : materials;

  const columns: Column<MrRow>[] = [
    { key: "code", header: "Code", width: "w-[96px]", value: m => m.code, cell: m => <span className="identifier text-body-sm">{m.code}</span> },
    { key: "name", header: "Material", value: m => m.name, cell: m => <span className="font-medium">{m.name}</span> },
    { key: "category", header: "Category", width: "w-[110px]", value: m => m.category, cell: m => <span className="text-muted-foreground">{m.category}</span> },
    { key: "opening", header: "Opening stock", align: "right", numeric: true, width: "w-[130px]", value: m => m.opening, cell: m => m.opening },
    { key: "gross", header: "Gross req.", align: "right", numeric: true, width: "w-[115px]", value: m => m.gross, cell: m => m.gross },
    { key: "scheduled", header: "Scheduled receipts", align: "right", numeric: true, width: "w-[160px]", value: m => m.scheduled, cell: m => m.scheduled },
    { key: "net", header: "Net req.", align: "right", numeric: true, width: "w-[110px]", value: m => m.net, cell: m => <span className="font-medium">{m.net}</span> },
    { key: "safety", header: "Safety stock", align: "right", numeric: true, width: "w-[120px]", value: m => m.safety, cell: m => m.safety },
    { key: "reorder", header: "Reorder qty", align: "right", numeric: true, width: "w-[120px]", value: m => m.reorder, cell: m => m.reorder },
    { key: "coverage", header: "Coverage", align: "right", numeric: true, width: "w-[100px]", value: m => m.coverage, cell: m => `${m.coverage}d` },
    { key: "status", header: "Status", width: "w-[110px]", value: m => mrStatusLabel(m.status), cell: m => <StatusBadge status={m.status} label={mrStatusLabel(m.status)} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Material requirements</span>
        </h1>
        <div className="flex items-center gap-3">
          <select className={selectSm}>
            <option>All categories</option><option>Polymer</option><option>Chemical</option><option>Packaging</option><option>Fragrance</option>
          </select>
          <select className={selectSm}>
            <option>All warehouses</option><option>Pune Plant</option><option>Mumbai WH</option><option>Delhi Depot</option>
          </select>
          <label className="flex items-center gap-1.5 text-body-sm">
            <input type="checkbox" checked={showShortages} onChange={() => setShowShortages(!showShortages)} className="rounded" />
            Show only shortages
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={m => m.code}
          name="Material requirements"
          searchable
          columnToggle
          exportable
          pageSize={25}
        />
        <div className="px-4 py-3 border-t border-border text-body-sm text-muted-foreground">
          Showing {filtered.length} of {materials.length} materials
        </div>
      </div>
    </div>
  );
}
