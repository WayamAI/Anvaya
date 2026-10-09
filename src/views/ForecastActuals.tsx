import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DemandIcon, ForecastVsActualIcon, WarningIcon } from "@/components/icons/chronos";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";
import { RangePicker } from "@/components/app/chart-card";
import { useSeriesToggle } from "@/lib/chart-config";
import { useState } from "react";

const forecastData = [
  { month: "Apr", forecast: 4200, actual: 3980 }, { month: "May", forecast: 4500, actual: 4680 },
  { month: "Jun", forecast: 4800, actual: 4550 }, { month: "Jul", forecast: 5100, actual: 5320 },
  { month: "Aug", forecast: 4900, actual: 5180 }, { month: "Sep", forecast: 5200, actual: 4980 },
  { month: "Oct", forecast: 5500, actual: 5720 }, { month: "Nov", forecast: 5300, actual: 5150 },
  { month: "Dec", forecast: 4800, actual: 4620 }, { month: "Jan", forecast: 5600, actual: 5890 },
  { month: "Feb", forecast: 5400, actual: 5680 }, { month: "Mar", forecast: 5800, actual: null },
];

const FORECAST_RANGES = ["3M", "6M", "12M"] as const;
type ForecastRange = (typeof FORECAST_RANGES)[number];

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
  // Windows the existing twelve months; the tail is the recent end.
  const [range, setRange] = useState<ForecastRange>("12M");
  const forecastWindow = forecastData.slice(-parseInt(range, 10));
  const legend = useSeriesToggle(["forecast", "actual"]);

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Forecast vs. actuals</span>
        </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Overall MAPE" value="14.2%" icon={ForecastVsActualIcon} status="amber" />
        <KPICard title="Forecast bias" value="+3.1%" subtitle="Slight over-forecast" icon={DemandIcon} />
        <KPICard title="Best category" value="8.4%" subtitle="Polymers" icon={ForecastVsActualIcon} />
        <KPICard title="Worst category" value="24.1%" subtitle="Specialty Chemicals" icon={WarningIcon} status="red" />
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h3 className="text-body-md font-semibold">Forecast vs. actual — all materials (units)</h3>
          <RangePicker<ForecastRange> value={range} options={FORECAST_RANGES} onChange={setRange} />
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={forecastWindow} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis
              width={52}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toLocaleString()}
              label={{ value: "Units", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: CHART_COLORS.axis, textAnchor: "middle" } }}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
              formatter={(v: number | string) => (typeof v === "number" ? `${v.toLocaleString()} units` : "No actual yet")}
            />
            {/* Click a name to isolate or restore that series. */}
            <Legend
              iconSize={8}
              wrapperStyle={{ ...CHART_LEGEND_STYLE, cursor: "pointer" }}
              onClick={legend.onLegendClick}
            />
            <Line type="monotone" dataKey="forecast" stroke={SERIES[0]} strokeWidth={2} strokeDasharray="6 3" name="Forecast" hide={legend.isHidden("forecast")} />
            <Line type="monotone" dataKey="actual" stroke={SERIES[1]} strokeWidth={2} name="Actual" hide={legend.isHidden("actual")} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Material", "Forecast (3M)", "Actual (3M)", "Error %", "MAPE", "Trend"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
            )}
          </tr></thead>
          <tbody>
            {materials.map((m, i) => (
              <tr key={i} className="border-b border-border hover:bg-sunken">
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
