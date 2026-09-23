"use client";

import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { DataTable, type Column } from "@/components/app/data-table";
import { btnSecondarySm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";

const MATERIALS = [
  "Stearic Acid", "Fragrance Blend FG-04", "EDTA Disodium Salt", "Shrink Labels (Type B)",
  "Pine Oil", "Methyl Salicylate", "Preservative BKC-50", "Titanium Dioxide",
  "Citric Acid Monohydrate", "Polypropylene Granules", "Sodium Hypochlorite",
  "Shrink Labels (Type A)", "LDPE Caps 5L", "Caustic Soda Flakes", "Isopropyl Alcohol"
];

const WAREHOUSES = ["Pune Plant", "Mumbai WH", "Delhi Depot", "Chennai Hub"];
const VENDORS = [
  "Rashtriya Chemicals", "Givaudan India", "Aarti Industries", "Uflex Packaging",
  "Camphor & Allied", "Jayant Agro", "Thor Specialties", "Tronox India",
  "Jungbunzlauer India", "Reliance Polymers", "Gujarat Alkalies", "Mold-Tek Containers"
];

interface AlertRow {
  level: "red" | "amber" | "green";
  levelLabel: string;
  material: string;
  warehouse: string;
  stock: string;
  daily: string;
  days: number;
  reqBy: string;
  reorderBy: string;
  lead: number;
  vendor: string;
  /** Sort key only; stripped before the rows are handed out. */
  _days: number;
}

const generateAlerts = () => {
  const result: AlertRow[] = [];
  let seed = 777;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const addAlerts = (count: number, level: string, levelLabel: string, minDays: number, maxDays: number) => {
    for (let i = 0; i < count; i++) {
      const material = MATERIALS[Math.floor(random() * MATERIALS.length)];
      const warehouse = WAREHOUSES[Math.floor(random() * WAREHOUSES.length)];
      const isKg = random() > 0.4;
      const dailyUsage = Math.floor(random() * 200) + 10;
      const days = minDays + random() * (maxDays - minDays);
      const stock = Math.floor(dailyUsage * days);
      const lead = Math.floor(random() * 12) + 3;
      const vendor = VENDORS[Math.floor(random() * VENDORS.length)];

      const reqObj = new Date(2026, 2, 23 + Math.floor(days));
      const reqBy = reqObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");

      let reorderBy;
      if (levelLabel === "Critical") {
        reorderBy = "Immediate";
      } else {
        const reorderObj = new Date(reqObj.getTime() - lead * 86400000);
        reorderBy = reorderObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");
      }

      result.push({
        level: level as AlertRow["level"], levelLabel, material, warehouse,
        stock: `${stock.toLocaleString()} ${isKg ? 'kg' : 'L'}`,
        daily: `${dailyUsage} ${isKg ? 'kg' : 'L'}/d`,
        days: parseFloat(days.toFixed(1)),
        reqBy, reorderBy, lead, vendor,
        _days: days // for sorting
      });
    }
  };

  addAlerts(7, "red", "Critical", 0.5, 2.9);
  addAlerts(12, "amber", "High", 3.0, 7.0);
  addAlerts(23, "amber", "Medium", 7.1, 14.0);

  return result.sort((a, b) => a._days - b._days).map(({ _days, ...rest }) => rest);
};

const alerts = generateAlerts();

export default function StockExhaustionAlerts() {
  const router = useRouter();

  const counts = {
    critical: alerts.filter(a => a.levelLabel === "Critical").length,
    high: alerts.filter(a => a.levelLabel === "High").length,
    medium: alerts.filter(a => a.levelLabel === "Medium").length,
    total: alerts.length
  };

  type Alert = (typeof alerts)[number];
  const columns: Column<Alert>[] = [
    { key: "level", header: "Level", width: "w-[110px]", value: a => a.levelLabel, cell: a => <StatusBadge status={a.level} label={a.levelLabel} /> },
    { key: "material", header: "Material", value: a => a.material, cell: a => <span className="font-medium">{a.material}</span> },
    { key: "warehouse", header: "Warehouse", width: "w-[120px]", value: a => a.warehouse, cell: a => <span className="text-muted-foreground">{a.warehouse}</span> },
    { key: "stock", header: "Current stock", align: "right", numeric: true, width: "w-[130px]", value: a => a.stock, cell: a => a.stock },
    { key: "daily", header: "Daily use", align: "right", numeric: true, width: "w-[110px]", value: a => a.daily, cell: a => a.daily },
    { key: "days", header: "Days cover", align: "right", numeric: true, width: "w-[115px]", value: a => a.days, cell: a => <span className="font-medium">{a.days}d</span> },
    { key: "reqBy", header: "Required by", width: "w-[125px]", value: a => a.reqBy, cell: a => a.reqBy },
    { key: "reorderBy", header: "Reorder by", width: "w-[125px]", value: a => a.reorderBy, cell: a => <span className="font-medium">{a.reorderBy}</span> },
    { key: "lead", header: "Lead (d)", align: "right", numeric: true, width: "w-[95px]", value: a => a.lead, cell: a => a.lead },
    { key: "vendor", header: "Vendor", value: a => a.vendor, cell: a => a.vendor },
    {
      key: "action", header: "Action", width: "w-[110px]", sortable: false,
      cell: () => (
        <button onClick={() => router.push("/purchase-orders")} className={btnSecondarySm}>
          Raise PO
        </button>
      ),
    },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Stock exhaustion alerts</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Critical (< 3 days)", count: counts.critical, icon: "alert-critical", color: "bg-danger/10 text-danger border-danger/20" },
          { label: "High (3–7 days)", count: counts.high, icon: "alert-high", color: "bg-warning/10 text-warning border-warning/20" },
          { label: "Medium (7–14 days)", count: counts.medium, icon: "alert-medium", color: "bg-warning/10 text-warning border-warning/20" },
          { label: "Total active alerts", count: counts.total, icon: "alert-total", color: "bg-secondary text-foreground border-border" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
            {/* The icon is pulled out beside the figure and the label rather
                than stacked above them, so the card keeps the height it had
                and the number stays the first thing read. */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-display-xl leading-none tabular-nums">{s.count}</div>
                <div className="text-body-sm mt-0.5">{s.label}</div>
              </div>
              <img
                src={`/icons/alerts/${s.icon}.png`}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="block h-6 w-6 shrink-0 object-contain"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={alerts}
          rowKey={a => `${a.material}-${a.warehouse}-${a.reqBy}`}
          name="Stock exhaustion alerts"
          searchable
          columnToggle
          exportable
          pageSize={25}
        />
      </div>
    </div>
  );
}
