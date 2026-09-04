import KPICard from "@/components/KPICard";
import { Clock, TrendingUp, DollarSign, Truck } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

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
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Procurement Cycle Analytics</h2>
      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Avg PO Cycle Time" value="12.4 days" subtitle="Req to delivery" icon={Clock} status="amber" />
        <KPICard title="On-Time Delivery" value="83.2%" subtitle="Below 90% target" icon={Truck} status="amber" />
        <KPICard title="Price Variance" value="+2.1%" subtitle="Over budget" icon={DollarSign} status="amber" />
        <KPICard title="Top Vendor (Volume)" value="₹1.2 Cr" subtitle="Reliance Polymers" icon={TrendingUp} status="green" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
          <h3 className="text-sm font-semibold mb-3">Procurement Value Trend (₹L/month)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlySpend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="polymers" stackId="a" fill={SERIES[0]} name="Polymers" />
              <Bar dataKey="chemicals" stackId="a" fill={SERIES[1]} name="Chemicals" />
              <Bar dataKey="packaging" stackId="a" fill={SERIES[2]} name="Packaging" />
              <Bar dataKey="other" stackId="a" fill={SERIES[3]} name="Other" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold mb-3">Price Trends — Top Materials (₹/kg)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={priceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
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
