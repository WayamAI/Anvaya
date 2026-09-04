import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Target, AlertTriangle } from "lucide-react";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

const forecastData = [
  { month: "Apr", forecast: 4200, actual: 3980 }, { month: "May", forecast: 4500, actual: 4680 },
  { month: "Jun", forecast: 4800, actual: 4550 }, { month: "Jul", forecast: 5100, actual: 5320 },
  { month: "Aug", forecast: 4900, actual: 5180 }, { month: "Sep", forecast: 5200, actual: 4980 },
  { month: "Oct", forecast: 5500, actual: 5720 }, { month: "Nov", forecast: 5300, actual: 5150 },
  { month: "Dec", forecast: 4800, actual: 4620 }, { month: "Jan", forecast: 5600, actual: 5890 },
  { month: "Feb", forecast: 5400, actual: 5680 }, { month: "Mar", forecast: 5800, actual: null },
];

const materials = [
  { name: "Polypropylene Granules", forecast: "14,200 kg", actual: "15,100 kg", error: 6.3, mape: "8.4%", trend: "Improving" },
  { name: "Stearic Acid", forecast: "1,260 kg", actual: "1,480 kg", error: 17.5, mape: "18.2%", trend: "Degrading" },
  { name: "HDPE Resin", forecast: "22,400 kg", actual: "21,800 kg", error: 2.8, mape: "5.1%", trend: "Stable" },
  { name: "Sodium Lauryl Sulphate", forecast: "3,800 kg", actual: "4,120 kg", error: 8.4, mape: "12.5%", trend: "Improving" },
  { name: "Titanium Dioxide", forecast: "5,200 kg", actual: "6,100 kg", error: 17.3, mape: "24.1%", trend: "Degrading" },
  { name: "HDPE Bottle 5L", forecast: "28,000 pcs", actual: "29,200 pcs", error: 4.3, mape: "6.8%", trend: "Stable" },
  { name: "Fragrance Blend FG-04", forecast: "420 L", actual: "510 L", error: 21.4, mape: "22.8%", trend: "Degrading" },
  { name: "Caustic Soda Flakes", forecast: "7,800 kg", actual: "7,650 kg", error: 2.0, mape: "4.2%", trend: "Stable" },
];

export default function ForecastActuals() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Forecast vs. Actuals</h2>
      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Overall MAPE" value="14.2%" icon={Target} status="amber" />
        <KPICard title="Forecast Bias" value="+3.1%" subtitle="Slight over-forecast" icon={TrendingUp} status="green" />
        <KPICard title="Best Category" value="8.4%" subtitle="Polymers" icon={Target} status="green" />
        <KPICard title="Worst Category" value="24.1%" subtitle="Specialty Chemicals" icon={AlertTriangle} status="red" />
      </div>
      <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold mb-3">Forecast vs. Actual — All Materials (units)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="forecast" stroke={SERIES[0]} strokeWidth={2} strokeDasharray="6 3" name="Forecast" />
            <Line type="monotone" dataKey="actual" stroke={SERIES[1]} strokeWidth={2} name="Actual" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["Material", "Forecast (3M)", "Actual (3M)", "Error %", "MAPE", "Trend"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
            )}
          </tr></thead>
          <tbody>
            {materials.map((m, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30">
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 tabular-nums">{m.forecast}</td>
                <td className="px-3 py-2 tabular-nums">{m.actual}</td>
                <td className="px-3 py-2 tabular-nums"><span className={m.error <= 10 ? "text-success" : m.error <= 20 ? "text-warning" : "text-danger"}>{m.error}%</span></td>
                <td className="px-3 py-2 tabular-nums font-medium">{m.mape}</td>
                <td className="px-3 py-2"><StatusBadge status={m.trend === "Improving" ? "green" : m.trend === "Stable" ? "blue" : "red"} label={m.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
