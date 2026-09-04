import StatusBadge from "@/components/StatusBadge";
import KPICard from "@/components/KPICard";
import { Shield, AlertTriangle, Info } from "lucide-react";

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
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Safety Stock Management</h2>

      </div>

      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Materials with Safety Stock" value="847" status="green" icon={Shield} />
        <KPICard title="Below Safety Stock Now" value="34" status="red" icon={AlertTriangle} />
        <KPICard title="No Buffer Defined" value="112" status="amber" icon={Info} />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground"><input type="checkbox" className="rounded" /></th>
                {["Material", "Category", "Avg. Daily", "Std Dev", "Lead (d)", "Variability", "Current SS", "Recommended", "Gap"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2"><input type="checkbox" className="rounded" /></td>
                  <td className="px-3 py-2 font-medium">{d.material}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.cat}</td>
                  <td className="px-3 py-2 tabular-nums">{d.avgDaily}</td>
                  <td className="px-3 py-2 tabular-nums">{d.stdDev}</td>
                  <td className="px-3 py-2 tabular-nums">{d.lead}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={d.variability === "High" ? "red" : d.variability === "Medium" ? "amber" : "green"} label={d.variability} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{d.current}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{d.recommended}</td>
                  <td className={`px-3 py-2 tabular-nums font-medium ${d.gap < 0 ? "text-danger" : "text-success"}`}>
                    {d.gap > 0 ? "+" : ""}{d.gap}
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
