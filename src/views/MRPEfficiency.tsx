import KPICard from "@/components/KPICard";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";

const adherenceData = [
  { month: "Apr", adherence: 78 }, { month: "May", adherence: 82 }, { month: "Jun", adherence: 80 },
  { month: "Jul", adherence: 85 }, { month: "Aug", adherence: 83 }, { month: "Sep", adherence: 87 },
  { month: "Oct", adherence: 84 }, { month: "Nov", adherence: 88 }, { month: "Dec", adherence: 86 },
  { month: "Jan", adherence: 90 }, { month: "Feb", adherence: 89 }, { month: "Mar", adherence: 91 },
];

const exceptionTypes = [
  { type: "Material Shortage", count: 42, resolved: 38, avg: "2.1 days" },
  { type: "Late Delivery Risk", count: 28, resolved: 22, avg: "3.4 days" },
  { type: "BOM Missing/Error", count: 8, resolved: 8, avg: "1.2 days" },
  { type: "Excess Stock Alert", count: 15, resolved: 12, avg: "5.8 days" },
  { type: "Capacity Constraint", count: 11, resolved: 9, avg: "2.8 days" },
];

const runHistory = [
  { date: "23 Mar 2026", type: "Full", duration: "4m 12s", planned: 312, exceptions: 18, status: "Completed" },
  { date: "22 Mar 2026", type: "Net Change", duration: "1m 45s", planned: 48, exceptions: 5, status: "Completed" },
  { date: "21 Mar 2026", type: "Full", duration: "4m 28s", planned: 298, exceptions: 22, status: "Completed" },
  { date: "20 Mar 2026", type: "Net Change", duration: "1m 32s", planned: 35, exceptions: 3, status: "Completed" },
  { date: "19 Mar 2026", type: "Full", duration: "4m 55s", planned: 305, exceptions: 20, status: "Completed" },
  { date: "18 Mar 2026", type: "Net Change", duration: "2m 10s", planned: 62, exceptions: 8, status: "Completed" },
  { date: "17 Mar 2026", type: "Full", duration: "5m 02s", planned: 320, exceptions: 25, status: "Completed" },
];

export default function MRPEfficiency() {
  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">MRP efficiency metrics</span>
        </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Plan adherence" value="91%" trend={{ value: "+5% vs Q3", direction: "up", positive: true }} iconName="plan-adherence" />
        <KPICard title="Avg run duration" value="4m 19s" subtitle="Full regenerative" iconName="avg-run-duration" />
        <KPICard title="Exception resolution" value="86%" subtitle="Resolved within SLA" iconName="exception-resolution" status="amber" />
        <KPICard title="Open exceptions" value="18" subtitle="6 high severity" iconName="open-exceptions" status="red" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-body-md font-semibold mb-3">MRP plan adherence (12 months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={adherenceData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis width={44} domain={[70, 100]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
              <Line type="monotone" dataKey="adherence" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="text-body-md font-semibold mb-3">Exception types (last 30 days)</h3>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-body-md">
              <thead><tr className="border-b border-border">
                {["Type", "Count", "Resolved", "Avg resolution"].map(h => <th key={h} className="text-left py-2 font-medium text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {exceptionTypes.map((e, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">{e.type}</td>
                    <td className="py-2 tabular-nums">{e.count}</td>
                    <td className="py-2 tabular-nums text-success">{e.resolved}</td>
                    <td className="py-2">{e.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <h3 className="text-body-md font-semibold px-4 pt-4 mb-3">MRP run history</h3>
        <table className="data-table w-full text-body-md">
          <thead><tr className="border-b border-border">
            {["Date", "Run type", "Duration", "Planned orders", "Exceptions", "Status"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {runHistory.map((r, i) => (
              <tr key={i} className="border-b border-border hover:bg-sunken">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2 font-medium">{r.type}</td>
                <td className="px-3 py-2 tabular-nums">{r.duration}</td>
                <td className="px-3 py-2 tabular-nums">{r.planned}</td>
                <td className="px-3 py-2 tabular-nums">{r.exceptions}</td>
                <td className="px-3 py-2 text-success font-medium">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
