import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";

const monthlyData = [
  { month: "Oct", poCount: 82, value: 95 }, { month: "Nov", poCount: 78, value: 88 },
  { month: "Dec", poCount: 65, value: 72 }, { month: "Jan", poCount: 92, value: 110 },
  { month: "Feb", poCount: 88, value: 105 }, { month: "Mar", poCount: 94, value: 118 },
];

const vendorPerformance = [
  { vendor: "Reliance Polymers", pos: 18, value: "₹1.2 Cr", otd: "92%", avgLead: "6d", savings: "₹2.4L" },
  { vendor: "Galaxy Surfactants", pos: 14, value: "₹85L", otd: "88%", avgLead: "7d", savings: "₹1.8L" },
  { vendor: "Rashtriya Chemicals", pos: 12, value: "₹72L", otd: "78%", avgLead: "14d", savings: "-₹0.8L" },
  { vendor: "Aarti Industries", pos: 10, value: "₹68L", otd: "85%", avgLead: "10d", savings: "₹1.2L" },
  { vendor: "Mold-Tek Containers", pos: 15, value: "₹62L", otd: "94%", avgLead: "5d", savings: "₹3.1L" },
  { vendor: "Tronox India", pos: 8, value: "₹58L", otd: "82%", avgLead: "6d", savings: "₹0.5L" },
  { vendor: "Uflex Packaging", pos: 16, value: "₹52L", otd: "91%", avgLead: "4d", savings: "₹2.2L" },
  { vendor: "Deepak Nitrite", pos: 9, value: "₹48L", otd: "86%", avgLead: "5d", savings: "₹1.5L" },
];

export default function ProcurementReports() {
  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Procurement reports</span>
        </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total POs (6M)" value="499" iconName="total-pos" />
        <KPICard title="Total spend (6M)" value="₹5.88 Cr" iconName="total-spend" />
        <KPICard title="Avg lead time" value="7.2 days" iconName="avg-lead-time" />
        <KPICard title="Cost savings YTD" value="₹12.4L" trend={{ value: "+18% vs LY", direction: "up", positive: true }} iconName="cost-savings" />
      </div>
      <div>
        <h3 className="text-body-md font-semibold mb-3">Monthly PO activity</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis width={44} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
            <Legend iconSize={8} wrapperStyle={CHART_LEGEND_STYLE} />
            <Bar dataKey="poCount" fill={SERIES[0]} name="PO count" radius={[3, 3, 0, 0]} />
            <Bar dataKey="value" fill={SERIES[1]} name="Value (₹L)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Vendor", "POs", "Total value", "OTD %", "Avg lead", "Savings"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {vendorPerformance.map((v, i) => (
              <tr key={i} className="border-b border-border hover:bg-sunken">
                <td className="px-3 py-2 font-medium">{v.vendor}</td>
                <td className="px-3 py-2 tabular-nums">{v.pos}</td>
                <td className="px-3 py-2 tabular-nums">{v.value}</td>
                <td className="px-3 py-2 tabular-nums">{v.otd}</td>
                <td className="px-3 py-2">{v.avgLead}</td>
                <td className={`px-3 py-2 tabular-nums font-medium ${v.savings.startsWith("-") ? "text-danger" : "text-success"}`}>{v.savings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
