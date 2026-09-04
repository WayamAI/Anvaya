"use client";

import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";

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

const generateAlerts = () => {
  const result: any[] = [];
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
        level, levelLabel, material, warehouse,
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Stock Exhaustion Alerts</h2>
      </div>

      <div className="grid grid-cols-4 gap-3 animate-fade-in-up stagger-1">
        {[
          { label: "Critical (< 3 days)", count: counts.critical, color: "bg-danger/10 text-danger border-danger/20" },
          { label: "High (3–7 days)", count: counts.high, color: "bg-warning/10 text-warning border-warning/20" },
          { label: "Medium (7–14 days)", count: counts.medium, color: "bg-accent/10 text-accent border-accent/20" },
          { label: "Total Active Alerts", count: counts.total, color: "bg-secondary text-foreground border-border" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
            <div className="text-2xl font-bold tabular-nums">{s.count}</div>
            <div className="text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                {["Level", "Material", "Warehouse", "Current Stock", "Daily Use", "Days Cover", "Required By", "Reorder By", "Lead (d)", "Vendor", "Action"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2"><StatusBadge status={a.level} label={a.levelLabel} /></td>
                  <td className="px-3 py-2 font-medium">{a.material}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.warehouse}</td>
                  <td className="px-3 py-2 tabular-nums">{a.stock}</td>
                  <td className="px-3 py-2 tabular-nums">{a.daily}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{a.days}d</td>
                  <td className="px-3 py-2">{a.reqBy}</td>
                  <td className="px-3 py-2 font-medium">{a.reorderBy}</td>
                  <td className="px-3 py-2 tabular-nums">{a.lead}</td>
                  <td className="px-3 py-2">{a.vendor}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => router.push("/purchase-orders")}
                      className="h-7 px-2.5 bg-accent text-accent-foreground rounded text-xs font-medium hover:opacity-90 active:scale-[0.97]"
                    >
                      Raise PO
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
