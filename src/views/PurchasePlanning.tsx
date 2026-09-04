import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { ClipboardList, ShoppingCart, AlertTriangle } from "lucide-react";

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
  
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Purchase Planning</h2>
      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Pending Requisitions" value="47" subtitle="₹2.8 Cr" icon={ClipboardList} status="amber" />
        <KPICard title="Planned POs to Raise" value="89" subtitle="₹6.1 Cr" icon={ShoppingCart} status="amber" />
        <KPICard title="Overdue POs" value="6" icon={AlertTriangle} status="red" />
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-secondary/50 border-b border-border">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground"><input type="checkbox" className="rounded" /></th>
              {["Material", "Req. Date", "Req. Qty", "Vendor", "Lead (d)", "Order By", "Sug. Qty", "Est. Cost", "Source", "Priority"].map(h =>
                <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {purchasePlan.map((p, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30">
                  <td className="px-3 py-2"><input type="checkbox" className="rounded" /></td>
                  <td className="px-3 py-2 font-medium">{p.material}</td>
                  <td className="px-3 py-2">{p.reqDate}</td>
                  <td className="px-3 py-2 tabular-nums">{p.reqQty}</td>
                  <td className="px-3 py-2">{p.vendor}</td>
                  <td className="px-3 py-2 tabular-nums">{p.lead}</td>
                  <td className="px-3 py-2 font-medium">{p.orderDate}</td>
                  <td className="px-3 py-2 tabular-nums">{p.sugQty}</td>
                  <td className="px-3 py-2 tabular-nums">{p.cost}</td>
                  <td className="px-3 py-2"><StatusBadge status="blue" label={p.source} /></td>
                  <td className="px-3 py-2"><StatusBadge status={p.priority} label={p.priority === "red" ? "Critical" : p.priority === "amber" ? "Medium" : "Low"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">

          <span className="text-xs text-muted-foreground">Showing 10 of 89 planned orders</span>
        </div>
      </div>
    </div>
  );
}
