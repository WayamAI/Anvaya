import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { PageIcon } from "@/components/app/page-icon";

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
  type SoRow = (typeof orders)[number];
  const columns: Column<SoRow>[] = [
    { key: "so", header: "SO #", width: "w-[130px]", value: o => o.so, cell: o => <span className="identifier text-body-sm text-foreground">{o.so}</span> },
    { key: "customer", header: "Customer", value: o => o.customer, cell: o => <span className="font-medium">{o.customer}</span> },
    { key: "date", header: "Order date", width: "w-[125px]", value: o => o.date, cell: o => o.date },
    { key: "items", header: "Items", align: "right", numeric: true, width: "w-[85px]", value: o => o.items, cell: o => o.items },
    { key: "value", header: "Value", align: "right", numeric: true, width: "w-[110px]", value: o => o.value, cell: o => o.value },
    { key: "delivery", header: "Delivery date", width: "w-[135px]", value: o => o.delivery, cell: o => o.delivery },
    {
      key: "priority", header: "Priority", width: "w-[110px]", value: o => o.priority,
      cell: o => <StatusBadge status={o.priority === "High" ? "red" : o.priority === "Medium" ? "amber" : "green"} label={o.priority} />,
    },
    { key: "status", header: "Status", width: "w-[130px]", value: o => o.status, cell: o => <StatusBadge status={statusMap[o.status]} label={o.status} /> },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Sales order intake</span>
        </h1>
        <div className="flex gap-2 text-body-sm">
          {[{ l: "New", c: 5 }, { l: "Processing", c: 1 }, { l: "Confirmed", c: 2 }, { l: "Dispatched", c: 1 }, { l: "Delivered", c: 3 }].map(s => (
            <span key={s.l} className="px-2 py-1 bg-secondary rounded-full font-medium">{s.l}: {s.c}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ l: "Total Open Orders", v: "8", s: "₹95.6L" }, { l: "Due This Week", v: "3", s: "₹26.2L" }, { l: "Orders Today", v: "5", s: "₹79.8L" }, { l: "MTD Dispatch Value", v: "₹1.42 Cr", s: "vs ₹1.35 Cr target" }].map(k => (
          <div key={k.l}>
            <div className="text-body-sm text-muted-foreground">{k.l}</div>
            <div className="text-display-lg font-semibold mt-1">{k.v}</div>
            <div className="text-body-sm text-muted-foreground mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={orders}
        rowKey={o => o.so}
        name="Sales orders"
        searchable
        columnToggle
        exportable
      />
    </div>
  );
}
