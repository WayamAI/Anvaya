import { useState, useMemo } from "react";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";

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

  type PO = (typeof allPOs)[number];
  const columns: Column<PO>[] = [
    { key: "po", header: "PO number", width: "w-[140px]", value: p => p.po, cell: p => <span className="identifier text-body-sm">{p.po}</span> },
    { key: "vendor", header: "Vendor", value: p => p.vendor, cell: p => <span className="font-medium">{p.vendor}</span> },
    { key: "date", header: "Order date", width: "w-[130px]", value: p => p.date, cell: p => p.date },
    { key: "delivery", header: "Expected delivery", width: "w-[150px]", value: p => p.delivery, cell: p => p.delivery },
    { key: "value", header: "Value", align: "right", numeric: true, width: "w-[100px]", value: p => p.value, cell: p => p.value },
    { key: "items", header: "Items", align: "right", numeric: true, width: "w-[70px]", value: p => p.items, cell: p => p.items },
    {
      key: "received", header: "Received", align: "right", numeric: true, width: "w-[100px]",
      value: p => p.received,
      // Payment was a second badge on every row. As plain text next to the
      // receipt figure it carries the same information without the noise.
      cell: p => (
        <span className="whitespace-nowrap">
          {p.received}%
          <span className="ml-2 text-body-sm text-muted-foreground">{p.payment}</span>
        </span>
      ),
    },
    {
      key: "status", header: "Status", width: "w-[150px]",
      cell: p => <StatusBadge status={statusMap[p.status]} label={p.status} />,
    },
  ];

  return (
    <div className="px-6 py-5">
      <PageHeader title="Purchase orders" description={`${filteredPOs.length.toLocaleString()} orders`} />

      <div className="-mx-1 mb-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-body-md font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="tabular-nums text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filteredPOs}
        rowKey={p => p.po}
        name="Purchase orders"
        searchable
        columnToggle
        exportable
        pageSize={25}
        empty={<EmptyState title="No purchase orders" description="Nothing matches this filter yet." />}
      />
    </div>
  );
}
