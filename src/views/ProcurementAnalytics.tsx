import KPICard from "@/components/KPICard";
import { CostIcon, LeadTimeIcon, ShipmentIcon, SupplierIcon } from "@/components/icons/chronos";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";
import { useSeriesToggle } from "@/lib/chart-config";

const monthlySpend = [
  { month: "Apr", polymers: 42, chemicals: 28, packaging: 18, other: 12 },
  { month: "May", polymers: 38, chemicals: 32, packaging: 20, other: 10 },
  { month: "Jun", polymers: 45, chemicals: 26, packaging: 22, other: 14 },
  { month: "Jul", polymers: 40, chemicals: 30, packaging: 19, other: 11 },
  { month: "Aug", polymers: 48, chemicals: 34, packaging: 24, other: 13 },
  { month: "Sep", polymers: 44, chemicals: 31, packaging: 21, other: 12 },
  { month: "Oct", polymers: 50, chemicals: 28, packaging: 23, other: 15 },
  { month: "Nov", polymers: 46, chemicals: 33, packaging: 20, other: 11 },
  { month: "Dec", polymers: 42, chemicals: 29, packaging: 18, other: 10 },
  { month: "Jan", polymers: 52, chemicals: 35, packaging: 25, other: 14 },
  { month: "Feb", polymers: 48, chemicals: 32, packaging: 22, other: 13 },
  { month: "Mar", polymers: 55, chemicals: 38, packaging: 26, other: 16 },
];

const priceTrend = [
  { month: "Apr", PP: 78, SA: 132, TiO2: 295, SLS: 172 },
  { month: "Jun", PP: 80, SA: 138, TiO2: 310, SLS: 178 },
  { month: "Aug", PP: 82, SA: 142, TiO2: 305, SLS: 182 },
  { month: "Oct", PP: 79, SA: 148, TiO2: 320, SLS: 180 },
  { month: "Dec", PP: 81, SA: 140, TiO2: 315, SLS: 185 },
  { month: "Feb", PP: 82, SA: 145, TiO2: 320, SLS: 185 },
];

export default function ProcurementAnalytics() {
  const spendLegend = useSeriesToggle(["polymers", "chemicals", "packaging", "other"]);

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Procurement cycle analytics</span>
        </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Avg PO cycle time" value="12.4 days" subtitle="Req to delivery" icon={LeadTimeIcon} status="amber" />
        <KPICard title="On-time delivery" value="83.2%" subtitle="Below 90% target" icon={ShipmentIcon} status="amber" />
        <KPICard title="Price variance" value="+2.1%" subtitle="Over budget" icon={CostIcon} status="amber" />
        <KPICard title="Top vendor (volume)" value="₹1.2 Cr" subtitle="Reliance Polymers" icon={SupplierIcon} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-body-md font-semibold mb-3">Procurement value trend (₹L/month)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlySpend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={6} />
              <YAxis
                width={52}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{ value: "₹L", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: CHART_COLORS.axis, textAnchor: "middle" } }}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.3 }}
                formatter={(v: number | string) => (typeof v === "number" ? `₹${v.toLocaleString()}L` : v)}
              />
              {/* Click a category to drop it out of the stack. */}
              <Legend
                iconSize={8}
                wrapperStyle={{ ...CHART_LEGEND_STYLE, cursor: "pointer" }}
                onClick={spendLegend.onLegendClick}
              />
              <Bar dataKey="polymers" stackId="a" fill={SERIES[0]} name="Polymers" hide={spendLegend.isHidden("polymers")} />
              <Bar dataKey="chemicals" stackId="a" fill={SERIES[1]} name="Chemicals" hide={spendLegend.isHidden("chemicals")} />
              <Bar dataKey="packaging" stackId="a" fill={SERIES[2]} name="Packaging" hide={spendLegend.isHidden("packaging")} />
              <Bar dataKey="other" stackId="a" fill={SERIES[3]} name="Other" radius={[3, 3, 0, 0]} hide={spendLegend.isHidden("other")} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="text-body-md font-semibold mb-3">Price trends — top materials (₹/kg)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={priceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis width={44} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
              <Legend iconSize={8} wrapperStyle={CHART_LEGEND_STYLE} />
              <Line type="monotone" dataKey="PP" stroke={SERIES[0]} strokeWidth={2} dot={false} name="Polypropylene" />
              <Line type="monotone" dataKey="SA" stroke={SERIES[1]} strokeWidth={1.5} dot={false} name="Stearic Acid" />
              <Line type="monotone" dataKey="TiO2" stroke={SERIES[2]} strokeWidth={1.5} dot={false} name="TiO2" />
              <Line type="monotone" dataKey="SLS" stroke={SERIES[3]} strokeWidth={1.5} dot={false} name="SLS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
