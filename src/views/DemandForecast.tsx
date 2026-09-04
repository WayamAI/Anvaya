import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { TrendingUp, BarChart3, Target } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

const demandTrend = [
  { month: "Apr", demand: 3800 }, { month: "May", demand: 4100 }, { month: "Jun", demand: 4350 },
  { month: "Jul", demand: 4600 }, { month: "Aug", demand: 4900 }, { month: "Sep", demand: 4700 },
  { month: "Oct", demand: 5200 }, { month: "Nov", demand: 5100 }, { month: "Dec", demand: 4500 },
  { month: "Jan", demand: 5400 }, { month: "Feb", demand: 5600 }, { month: "Mar", demand: 5800 },
  { month: "Apr*", demand: 6100 }, { month: "May*", demand: 6300 }, { month: "Jun*", demand: 6500 },
];

const categoryDemand = [
  { category: "Cleaning", current: 3200, forecast: 3800 },
  { category: "Personal Care", current: 1800, forecast: 2100 },
  { category: "Industrial", current: 1400, forecast: 1600 },
  { category: "Disinfectant", current: 800, forecast: 1200 },
];

const products = [
  { product: "Industrial Cleaner 5L", current: "2,400/mo", forecast3m: "2,800/mo", growth: "+16.7%", confidence: "High", seasonality: "Low" },
  { product: "Floor Polish 1L", current: "5,200/mo", forecast3m: "6,100/mo", growth: "+17.3%", confidence: "Medium", seasonality: "Medium" },
  { product: "Dish Wash Liquid 500ml", current: "8,800/mo", forecast3m: "9,400/mo", growth: "+6.8%", confidence: "High", seasonality: "Low" },
  { product: "Hand Wash 250ml", current: "12,000/mo", forecast3m: "13,500/mo", growth: "+12.5%", confidence: "High", seasonality: "Medium" },
  { product: "Glass Cleaner 1L", current: "3,100/mo", forecast3m: "3,600/mo", growth: "+16.1%", confidence: "Medium", seasonality: "High" },
  { product: "Toilet Cleaner 500ml", current: "6,500/mo", forecast3m: "7,200/mo", growth: "+10.8%", confidence: "High", seasonality: "Low" },
  { product: "Surface Disinfectant 5L", current: "1,800/mo", forecast3m: "2,400/mo", growth: "+33.3%", confidence: "Low", seasonality: "High" },
  { product: "Multi-Surface Cleaner 1L", current: "4,200/mo", forecast3m: "4,600/mo", growth: "+9.5%", confidence: "High", seasonality: "Low" },
];

export default function DemandForecast() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Demand Forecast</h2>
      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Avg Monthly Demand" value="5,120 units" trend={{ value: "+8.2% YoY", direction: "up", positive: true }} icon={TrendingUp} status="green" />
        <KPICard title="Next Quarter Forecast" value="18,900 units" subtitle="Apr–Jun 2026" icon={BarChart3} status="green" />
        <KPICard title="Forecast Accuracy" value="85.8%" subtitle="MAPE: 14.2%" icon={Target} status="amber" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
          <h3 className="text-sm font-semibold mb-3">Demand Trend & 3-Month Forecast</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={demandTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="demand" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-1">* = Forecast period</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold mb-3">Demand by Category (Current vs Forecast)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryDemand}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="current" fill={SERIES[0]} name="Current" radius={[3, 3, 0, 0]} />
              <Bar dataKey="forecast" fill={SERIES[1]} name="Forecast" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["Product", "Current Demand", "3M Forecast", "Growth", "Confidence", "Seasonality"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30">
                <td className="px-3 py-2 font-medium">{p.product}</td>
                <td className="px-3 py-2 tabular-nums">{p.current}</td>
                <td className="px-3 py-2 tabular-nums font-medium">{p.forecast3m}</td>
                <td className="px-3 py-2 tabular-nums text-success">{p.growth}</td>
                <td className="px-3 py-2"><StatusBadge status={p.confidence === "High" ? "green" : p.confidence === "Medium" ? "amber" : "red"} label={p.confidence} /></td>
                <td className="px-3 py-2"><StatusBadge status={p.seasonality === "Low" ? "green" : p.seasonality === "Medium" ? "amber" : "red"} label={p.seasonality} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
