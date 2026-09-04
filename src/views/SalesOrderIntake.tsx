import StatusBadge from "@/components/StatusBadge";

const orders = [
  { so: "SO-4521", customer: "Reliance Retail", date: "22 Mar 2026", items: 4, value: "₹8.4L", delivery: "28 Mar 2026", priority: "High", status: "Confirmed" },
  { so: "SO-4528", customer: "DMart", date: "21 Mar 2026", items: 6, value: "₹12.6L", delivery: "30 Mar 2026", priority: "High", status: "Confirmed" },
  { so: "SO-4532", customer: "BigBasket", date: "22 Mar 2026", items: 3, value: "₹5.2L", delivery: "1 Apr 2026", priority: "Medium", status: "Processing" },
  { so: "SO-4535", customer: "Amazon India", date: "23 Mar 2026", items: 8, value: "₹18.9L", delivery: "2 Apr 2026", priority: "High", status: "New" },
  { so: "SO-4536", customer: "Flipkart", date: "23 Mar 2026", items: 5, value: "₹14.2L", delivery: "3 Apr 2026", priority: "Medium", status: "New" },
  { so: "SO-4538", customer: "Metro Cash & Carry", date: "23 Mar 2026", items: 7, value: "₹22.8L", delivery: "5 Apr 2026", priority: "Medium", status: "New" },
  { so: "SO-4515", customer: "Spencer's Retail", date: "18 Mar 2026", items: 3, value: "₹4.8L", delivery: "25 Mar 2026", priority: "High", status: "Dispatched" },
  { so: "SO-4510", customer: "More Retail", date: "16 Mar 2026", items: 4, value: "₹6.1L", delivery: "23 Mar 2026", priority: "Medium", status: "Delivered" },
  { so: "SO-4505", customer: "Star Bazaar", date: "15 Mar 2026", items: 2, value: "₹3.2L", delivery: "22 Mar 2026", priority: "Low", status: "Delivered" },
  { so: "SO-4540", customer: "Vishal Mega Mart", date: "23 Mar 2026", items: 4, value: "₹7.5L", delivery: "4 Apr 2026", priority: "Medium", status: "New" },
  { so: "SO-4542", customer: "JioMart", date: "23 Mar 2026", items: 6, value: "₹16.4L", delivery: "6 Apr 2026", priority: "High", status: "New" },
  { so: "SO-4500", customer: "Nykaa Business", date: "14 Mar 2026", items: 2, value: "₹2.8L", delivery: "21 Mar 2026", priority: "Low", status: "Delivered" },
];

const statusMap: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  New: "blue", Confirmed: "green", Processing: "amber", Dispatched: "blue", Delivered: "green",
};

export default function SalesOrderIntake() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Sales Order Intake</h2>
        <div className="flex gap-2 text-xs">
          {[{ l: "New", c: 5 }, { l: "Processing", c: 1 }, { l: "Confirmed", c: 2 }, { l: "Dispatched", c: 1 }, { l: "Delivered", c: 3 }].map(s => (
            <span key={s.l} className="px-2 py-1 bg-secondary rounded-full font-medium">{s.l}: {s.c}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 animate-fade-in-up stagger-1">
        {[{ l: "Total Open Orders", v: "8", s: "₹95.6L" }, { l: "Due This Week", v: "3", s: "₹26.2L" }, { l: "Orders Today", v: "5", s: "₹79.8L" }, { l: "MTD Dispatch Value", v: "₹1.42 Cr", s: "vs ₹1.35 Cr target" }].map(k => (
          <div key={k.l} className="bg-card rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className="text-xl font-bold mt-1">{k.v}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["SO #", "Customer", "Order Date", "Items", "Value", "Delivery Date", "Priority", "Status"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30 cursor-pointer">
                <td className="px-3 py-2 font-mono text-xs text-accent">{o.so}</td>
                <td className="px-3 py-2 font-medium">{o.customer}</td>
                <td className="px-3 py-2">{o.date}</td>
                <td className="px-3 py-2 tabular-nums">{o.items}</td>
                <td className="px-3 py-2 tabular-nums">{o.value}</td>
                <td className="px-3 py-2">{o.delivery}</td>
                <td className="px-3 py-2"><StatusBadge status={o.priority === "High" ? "red" : o.priority === "Medium" ? "amber" : "green"} label={o.priority} /></td>
                <td className="px-3 py-2"><StatusBadge status={statusMap[o.status]} label={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
