import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText, TrendingDown, Clock, DollarSign } from "lucide-react";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

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
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Procurement Reports</h2>
      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Total POs (6M)" value="499" icon={FileText} status="green" />
        <KPICard title="Total Spend (6M)" value="₹5.88 Cr" icon={DollarSign} status="green" />
        <KPICard title="Avg Lead Time" value="7.2 days" icon={Clock} status="green" />
        <KPICard title="Cost Savings YTD" value="₹12.4L" trend={{ value: "+18% vs LY", direction: "up", positive: true }} icon={TrendingDown} status="green" />
      </div>
      <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold mb-3">Monthly PO Activity</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="poCount" fill={SERIES[0]} name="PO Count" radius={[3, 3, 0, 0]} />
            <Bar dataKey="value" fill={SERIES[1]} name="Value (₹L)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["Vendor", "POs", "Total Value", "OTD %", "Avg Lead", "Savings"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {vendorPerformance.map((v, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30">
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
