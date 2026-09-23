import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import KPICard from "@/components/KPICard";
import { Shield, AlertTriangle, Info } from "lucide-react";
import { PageIcon } from "@/components/app/page-icon";

const data = [
  { material: "Polypropylene Granules", cat: "Polymer", avgDaily: "280 kg/d", stdDev: "45 kg", lead: 7, variability: "Medium", current: "500 kg", recommended: "680 kg", gap: -180 },
  { material: "Sodium Lauryl Sulphate", cat: "Chemical", avgDaily: "42 kg/d", stdDev: "12 kg", lead: 14, variability: "High", current: "200 kg", recommended: "380 kg", gap: -180 },
  { material: "HDPE Resin", cat: "Polymer", avgDaily: "310 kg/d", stdDev: "28 kg", lead: 5, variability: "Low", current: "800 kg", recommended: "620 kg", gap: 180 },
  { material: "Stearic Acid", cat: "Chemical", avgDaily: "42 kg/d", stdDev: "18 kg", lead: 14, variability: "High", current: "100 kg", recommended: "340 kg", gap: -240 },
  { material: "EDTA Disodium Salt", cat: "Chemical", avgDaily: "18 kg/d", stdDev: "6 kg", lead: 10, variability: "Medium", current: "50 kg", recommended: "120 kg", gap: -70 },
  { material: "Titanium Dioxide", cat: "Pigment", avgDaily: "78 kg/d", stdDev: "22 kg", lead: 6, variability: "Medium", current: "150 kg", recommended: "280 kg", gap: -130 },
  { material: "Fragrance Blend FG-04", cat: "Fragrance", avgDaily: "6 L/d", stdDev: "2 L", lead: 10, variability: "High", current: "10 L", recommended: "45 L", gap: -35 },
  { material: "Caustic Soda Flakes", cat: "Chemical", avgDaily: "95 kg/d", stdDev: "15 kg", lead: 5, variability: "Low", current: "300 kg", recommended: "260 kg", gap: 40 },
  { material: "Citric Acid Monohydrate", cat: "Chemical", avgDaily: "22 kg/d", stdDev: "8 kg", lead: 8, variability: "Medium", current: "80 kg", recommended: "110 kg", gap: -30 },
  { material: "Demineralised Water", cat: "Utility", avgDaily: "620 L/d", stdDev: "80 L", lead: 2, variability: "Low", current: "2,000 L", recommended: "1,400 L", gap: 600 },
  { material: "HDPE Bottle 5L", cat: "Packaging", avgDaily: "450 pcs/d", stdDev: "60 pcs", lead: 5, variability: "Low", current: "1,000 pcs", recommended: "1,100 pcs", gap: -100 },
  { material: "Shrink Labels (Type A)", cat: "Packaging", avgDaily: "320 pcs/d", stdDev: "50 pcs", lead: 4, variability: "Medium", current: "500 pcs", recommended: "680 pcs", gap: -180 },
  { material: "Isopropyl Alcohol", cat: "Solvent", avgDaily: "28 L/d", stdDev: "5 L", lead: 4, variability: "Low", current: "100 L", recommended: "85 L", gap: 15 },
  { material: "Pine Oil", cat: "Essential Oil", avgDaily: "3.2 L/d", stdDev: "1.1 L", lead: 8, variability: "High", current: "10 L", recommended: "22 L", gap: -12 },
  { material: "Coconut Diethanolamide", cat: "Chemical", avgDaily: "14 kg/d", stdDev: "4 kg", lead: 6, variability: "Medium", current: "60 kg", recommended: "55 kg", gap: 5 },
];

export default function SafetyStock() {
  type SsRow = (typeof data)[number];
  const columns: Column<SsRow>[] = [
    {
      key: "select", header: "", width: "w-[44px]", sortable: false,
      cell: () => <input type="checkbox" className="rounded" aria-label="Select row" />,
    },
    { key: "material", header: "Material", value: d => d.material, cell: d => <span className="font-medium">{d.material}</span> },
    { key: "cat", header: "Category", width: "w-[110px]", value: d => d.cat, cell: d => <span className="text-muted-foreground">{d.cat}</span> },
    { key: "avgDaily", header: "Avg. daily", align: "right", numeric: true, width: "w-[110px]", value: d => d.avgDaily, cell: d => d.avgDaily },
    { key: "stdDev", header: "Std dev", align: "right", numeric: true, width: "w-[100px]", value: d => d.stdDev, cell: d => d.stdDev },
    { key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[95px]", value: d => d.lead, cell: d => d.lead },
    {
      key: "variability", header: "Variability", width: "w-[120px]", value: d => d.variability,
      cell: d => <StatusBadge status={d.variability === "High" ? "red" : d.variability === "Medium" ? "amber" : "green"} label={d.variability} />,
    },
    { key: "current", header: "Current SS", align: "right", numeric: true, width: "w-[115px]", value: d => d.current, cell: d => d.current },
    { key: "recommended", header: "Recommended", align: "right", numeric: true, width: "w-[135px]", value: d => d.recommended, cell: d => <span className="font-medium">{d.recommended}</span> },
    {
      key: "gap", header: "Gap", align: "right", numeric: true, width: "w-[90px]", value: d => d.gap,
      cell: d => (
        <span className={`font-medium ${d.gap < 0 ? "text-danger" : "text-success"}`}>
          {d.gap > 0 ? "+" : ""}{d.gap}
        </span>
      ),
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Safety stock management</span>
        </h1>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="Materials with safety stock" value="847" icon={Shield} />
        <KPICard title="Below safety stock now" value="34" status="red" icon={AlertTriangle} />
        <KPICard title="No buffer defined" value="112" status="amber" icon={Info} />
      </div>

      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={data}
          rowKey={d => d.material}
          name="Safety stock"
          searchable
          columnToggle
          exportable
        />
      </div>
    </div>
  );
}
