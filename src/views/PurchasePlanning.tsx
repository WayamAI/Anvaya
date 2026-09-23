import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { AlertTriangle } from "lucide-react";
import { PageIcon } from "@/components/app/page-icon";

const purchasePlan = [
  { material: "Stearic Acid", reqDate: "27 Mar 2026", reqQty: "500 kg", uom: "KG", vendor: "Rashtriya Chemicals", lead: 14, orderDate: "Immediate", sugQty: "500 kg", cost: "₹72,500", source: "MRP", priority: "red" as const },
  { material: "Polypropylene Granules", reqDate: "5 Apr 2026", reqQty: "5,000 kg", uom: "KG", vendor: "Reliance Polymers", lead: 7, orderDate: "29 Mar 2026", sugQty: "5,000 kg", cost: "₹4.10L", source: "MRP", priority: "amber" as const },
  { material: "EDTA Disodium Salt", reqDate: "28 Mar 2026", reqQty: "300 kg", uom: "KG", vendor: "Aarti Industries", lead: 10, orderDate: "Immediate", sugQty: "400 kg", cost: "₹1.68L", source: "MRP", priority: "red" as const },
  { material: "Fragrance Blend FG-04", reqDate: "27 Mar 2026", reqQty: "100 L", uom: "L", vendor: "Givaudan India", lead: 10, orderDate: "Immediate", sugQty: "100 L", cost: "₹2.80L", source: "MRP", priority: "red" as const },
  { material: "Titanium Dioxide", reqDate: "3 Apr 2026", reqQty: "2,000 kg", uom: "KG", vendor: "Tronox India", lead: 6, orderDate: "27 Mar 2026", sugQty: "2,000 kg", cost: "₹6.40L", source: "MRP", priority: "amber" as const },
  { material: "HDPE Bottle 5L", reqDate: "4 Apr 2026", reqQty: "10,000 pcs", uom: "PCS", vendor: "Mold-Tek Containers", lead: 5, orderDate: "28 Mar 2026", sugQty: "10,000 pcs", cost: "₹4.20L", source: "MRP", priority: "amber" as const },
  { material: "Shrink Labels (Type B)", reqDate: "28 Mar 2026", reqQty: "5,000 pcs", uom: "PCS", vendor: "Uflex Packaging", lead: 4, orderDate: "Immediate", sugQty: "5,000 pcs", cost: "₹16,000", source: "MRP", priority: "red" as const },
  { material: "Sodium Hypochlorite", reqDate: "31 Mar 2026", reqQty: "1,000 L", uom: "L", vendor: "Gujarat Alkalies", lead: 5, orderDate: "26 Mar 2026", sugQty: "1,000 L", cost: "₹22,000", source: "Min-Max", priority: "amber" as const },
  { material: "Pine Oil", reqDate: "30 Mar 2026", reqQty: "80 L", uom: "L", vendor: "Camphor & Allied", lead: 8, orderDate: "Immediate", sugQty: "100 L", cost: "₹65,000", source: "MRP", priority: "red" as const },
  { material: "Corrugated Cartons (5Lx6)", reqDate: "7 Apr 2026", reqQty: "5,000 pcs", uom: "PCS", vendor: "Packman Industries", lead: 3, orderDate: "1 Apr 2026", sugQty: "5,000 pcs", cost: "₹1.40L", source: "Manual", priority: "green" as const },
];

export default function PurchasePlanning() {
  
  type PlanRow = (typeof purchasePlan)[number];
  const priorityLabel = (p: PlanRow["priority"]) =>
    p === "red" ? "Critical" : p === "amber" ? "Medium" : "Low";

  const columns: Column<PlanRow>[] = [
    {
      key: "select", header: "", width: "w-[44px]", sortable: false,
      cell: () => <input type="checkbox" className="rounded" aria-label="Select row" />,
    },
    { key: "material", header: "Material", value: p => p.material, cell: p => <span className="font-medium">{p.material}</span> },
    { key: "reqDate", header: "Req. date", width: "w-[120px]", value: p => p.reqDate, cell: p => p.reqDate },
    { key: "reqQty", header: "Req. qty", align: "right", numeric: true, width: "w-[110px]", value: p => p.reqQty, cell: p => p.reqQty },
    { key: "vendor", header: "Vendor", value: p => p.vendor, cell: p => p.vendor },
    { key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[95px]", value: p => p.lead, cell: p => p.lead },
    { key: "orderDate", header: "Order by", width: "w-[120px]", value: p => p.orderDate, cell: p => <span className="font-medium">{p.orderDate}</span> },
    { key: "sugQty", header: "Sug. qty", align: "right", numeric: true, width: "w-[110px]", value: p => p.sugQty, cell: p => p.sugQty },
    { key: "cost", header: "Est. cost", align: "right", numeric: true, width: "w-[110px]", value: p => p.cost, cell: p => p.cost },
    { key: "source", header: "Source", width: "w-[110px]", value: p => p.source, cell: p => <StatusBadge status="blue" label={p.source} /> },
    { key: "priority", header: "Priority", width: "w-[110px]", value: p => priorityLabel(p.priority), cell: p => <StatusBadge status={p.priority} label={priorityLabel(p.priority)} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Purchase planning</span>
        </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="Pending requisitions" value="47" subtitle="₹2.8 Cr" iconName="requisitions" status="amber" />
        <KPICard title="Planned POs to raise" value="89" subtitle="₹6.1 Cr" iconName="planned-pos" status="amber" />
        <KPICard title="Overdue POs" value="6" icon={AlertTriangle} status="red" />
      </div>
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={purchasePlan}
          rowKey={p => `${p.material}-${p.reqDate}`}
          name="Purchase planning"
          searchable
          columnToggle
          exportable
        />
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">

          <span className="text-body-sm text-muted-foreground">Showing 10 of 89 planned orders</span>
        </div>
      </div>
    </div>
  );
}
