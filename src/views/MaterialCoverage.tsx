import StatusBadge from "@/components/StatusBadge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";

import { btnLink } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
const coverageData = [
  { week: "W1", "Polypropylene": 6.2, "Stearic Acid": 3.1, "HDPE Resin": 8.4, "SLS": 4.5, "TiO2": 5.1, "EDTA": 3.8 },
  { week: "W3", "Polypropylene": 5.1, "Stearic Acid": 2.2, "HDPE Resin": 7.2, "SLS": 3.8, "TiO2": 4.3, "EDTA": 3.0 },
  { week: "W5", "Polypropylene": 4.5, "Stearic Acid": 1.8, "HDPE Resin": 6.2, "SLS": 3.2, "TiO2": 3.5, "EDTA": 2.5 },
  { week: "W7", "Polypropylene": 3.8, "Stearic Acid": 1.2, "HDPE Resin": 5.4, "SLS": 2.6, "TiO2": 2.8, "EDTA": 1.8 },
  { week: "W9", "Polypropylene": 4.2, "Stearic Acid": 0.8, "HDPE Resin": 4.8, "SLS": 2.1, "TiO2": 2.2, "EDTA": 1.2 },
  { week: "W11", "Polypropylene": 3.4, "Stearic Acid": 0.5, "HDPE Resin": 4.2, "SLS": 1.5, "TiO2": 1.6, "EDTA": 0.8 },
  { week: "W13", "Polypropylene": 5.8, "Stearic Acid": 3.5, "HDPE Resin": 5.8, "SLS": 4.1, "TiO2": 3.8, "EDTA": 3.2 },
];

const materials = [
  { name: "Stearic Acid", coverage: 4.3, trend: "Declining", riskLevel: "Critical", nextPO: "Immediate", action: "Emergency PO" },
  { name: "Fragrance Blend FG-04", coverage: 3.7, trend: "Declining", riskLevel: "Critical", nextPO: "Immediate", action: "Emergency PO" },
  { name: "EDTA Disodium Salt", coverage: 5.3, trend: "Declining", riskLevel: "High", nextPO: "24 Mar 2026", action: "Expedite" },
  { name: "Shrink Labels (Type B)", coverage: 6.2, trend: "Stable", riskLevel: "High", nextPO: "25 Mar 2026", action: "Raise PO" },
  { name: "Pine Oil", coverage: 3.8, trend: "Declining", riskLevel: "Critical", nextPO: "Immediate", action: "Emergency PO" },
  { name: "Titanium Dioxide", coverage: 8.2, trend: "Declining", riskLevel: "Medium", nextPO: "25 Mar 2026", action: "Monitor" },
  { name: "Polypropylene Granules", coverage: 15.0, trend: "Stable", riskLevel: "Low", nextPO: "29 Mar 2026", action: "Planned" },
  { name: "HDPE Resin", coverage: 38.0, trend: "Stable", riskLevel: "None", nextPO: "N/A", action: "—" },
  { name: "Sodium Hypochlorite", coverage: 10.0, trend: "Declining", riskLevel: "Medium", nextPO: "26 Mar 2026", action: "Monitor" },
  { name: "Citric Acid Monohydrate", coverage: 11.0, trend: "Stable", riskLevel: "Low", nextPO: "30 Mar 2026", action: "Planned" },
];

export default function MaterialCoverage() {
  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Material coverage monitor</span>
        </h1>
      <div>
        <h3 className="text-body-md font-semibold mb-3">Coverage trend (weeks of stock)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={coverageData}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis width={44} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
            <ReferenceLine y={2} stroke={CHART_COLORS.primary} strokeDasharray="5 5" label={{ value: "Critical (2w)", fontSize: 10, fill: CHART_COLORS.primary }} />
            <Line type="monotone" dataKey="Polypropylene" stroke={SERIES[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Stearic Acid" stroke={SERIES[1]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="HDPE Resin" stroke={SERIES[2]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="SLS" stroke={SERIES[3]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="TiO2" stroke={SERIES[4]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="EDTA" stroke={CHART_COLORS.muted} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Material", "Coverage (days)", "Trend", "Risk level", "Next PO due", "Action"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {materials.map((m, i) => (
              <tr key={i} className="border-b border-border hover:bg-sunken">
                <td className="px-3 py-2 font-medium">{m.name}</td>
                <td className="px-3 py-2 tabular-nums font-medium">{m.coverage}d</td>
                <td className="px-3 py-2"><StatusBadge status={m.trend === "Declining" ? "red" : "green"} label={m.trend} /></td>
                <td className="px-3 py-2"><StatusBadge status={m.riskLevel === "Critical" ? "red" : m.riskLevel === "High" ? "red" : m.riskLevel === "Medium" ? "amber" : "green"} label={m.riskLevel} /></td>
                <td className="px-3 py-2">{m.nextPO}</td>
                <td className="px-3 py-2"><button className={btnLink}>{m.action}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
