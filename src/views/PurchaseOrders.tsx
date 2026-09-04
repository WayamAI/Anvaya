import { useState, useMemo } from "react";
import StatusBadge from "@/components/StatusBadge";

const tabs = [
  { key: "all", label: "All", count: 412 }, { key: "draft", label: "Draft", count: 8 },
  { key: "pending", label: "Pending Approval", count: 12 }, { key: "approved", label: "Approved", count: 24 },
  { key: "ordered", label: "Ordered", count: 87 }, { key: "partial", label: "Partially Received", count: 34 },
  { key: "received", label: "Fully Received", count: 241 }, { key: "cancelled", label: "Cancelled", count: 6 },
];

const VENDORS = [
  "Reliance Polymers", "Rashtriya Chemicals", "Galaxy Surfactants", "Aarti Industries",
  "Mold-Tek Containers", "Tronox India", "Uflex Packaging", "Deepak Nitrite",
  "Givaudan India", "Gujarat Alkalies", "SRF Limited", "Hindustan Zinc",
  "Pidilite Industries", "Tata Chemicals", "Bayer CropScience", "Atul Ltd"
];

const generateMockPOs = () => {
  const result = [];
  let poCounter = 1000;
  
  // Seed for deterministic random to avoid jumping on every render
  let seed = 12345;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const addItems = (count: number, status: string) => {
    for (let i = 0; i < count; i++) {
        poCounter--;
        const vendor = VENDORS[Math.floor(random() * VENDORS.length)];
        const items = Math.floor(random() * 5) + 1;
        
        let received = 0;
        let payment = "Pending";
        
        if (status === "Fully Received") {
            received = 100;
            payment = "Paid";
        } else if (status === "Partially Received") {
            received = Math.floor(random() * 80) + 10;
            payment = "Partial";
        } else if (status === "Cancelled") {
            received = 0;
            payment = "Pending";
        }
        
        // Random days ago for order date
        const dateObj = new Date(2026, 2, 25 - Math.floor(random() * 60)); 
        const deliveryObj = new Date(dateObj.getTime() + (Math.floor(random() * 15) + 5) * 86400000);
        
        const dateStr = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");
        const deliveryStr = deliveryObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");
        
        const valueLakhs = (random() * 10 + 0.5).toFixed(2);
        const value = `₹${valueLakhs}L`;
        
        result.push({
            po: `PO-2026-${String(poCounter).padStart(4, '0')}`,
            vendor,
            date: dateStr,
            delivery: deliveryStr,
            value,
            items,
            received,
            payment,
            status,
            _timestamp: dateObj.getTime()
        });
    }
  };

  addItems(8, "Draft");
  addItems(12, "Pending Approval");
  addItems(24, "Approved");
  addItems(87, "Ordered");
  addItems(34, "Partially Received");
  addItems(241, "Fully Received");
  addItems(6, "Cancelled");

  // Sort by date descending
  return result.sort((a, b) => b._timestamp - a._timestamp).map(({ _timestamp, ...rest }) => rest);
};

const allPOs = generateMockPOs();

const statusMap: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  "Draft": "gray", "Pending Approval": "amber", "Approved": "blue", "Ordered": "blue",
  "Partially Received": "amber", "Fully Received": "green", "Cancelled": "red",
};

export default function PurchaseOrders() {
  const [tab, setTab] = useState("all");

  const filteredPOs = useMemo(() => {
    if (tab === "all") return allPOs;
    const tabData = tabs.find(t => t.key === tab);
    if (!tabData) return allPOs;
    return allPOs.filter(po => po.status === tabData.label);
  }, [tab]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Purchase Orders</h2>

      </div>
      <div className="flex gap-1 border-b border-border overflow-x-auto animate-fade-in-up stagger-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-secondary/50 border-b border-border">
              {["PO Number", "Vendor", "Order Date", "Expected Delivery", "Value", "Items", "Received %", "Payment", "Status"].map(h =>
                <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {filteredPOs.map((p, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-xs text-accent">{p.po}</td>
                  <td className="px-3 py-2 font-medium">{p.vendor}</td>
                  <td className="px-3 py-2">{p.date}</td>
                  <td className="px-3 py-2">{p.delivery}</td>
                  <td className="px-3 py-2 tabular-nums">{p.value}</td>
                  <td className="px-3 py-2 tabular-nums">{p.items}</td>
                  <td className="px-3 py-2 tabular-nums">{p.received}%</td>
                  <td className="px-3 py-2"><StatusBadge status={p.payment === "Paid" ? "green" : p.payment === "Partial" ? "amber" : "gray"} label={p.payment} /></td>
                  <td className="px-3 py-2"><StatusBadge status={statusMap[p.status]} label={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPOs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No data found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
