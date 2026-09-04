import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

const invByCategory = [
  { name: "Polymers", value: 38 }, { name: "Chemicals", value: 28 },
  { name: "Packaging", value: 18 }, { name: "Fragrances", value: 8 }, { name: "Other", value: 8 },
];
const COLORS = [
  SERIES[0],
  SERIES[1],
  SERIES[2],
  SERIES[3],
  SERIES[4],
];

const abcData = [{ name: "A (High)", value: 15 }, { name: "B (Medium)", value: 35 }, { name: "C (Low)", value: 50 }];
const ABC_COLORS = [
  SERIES[0],
  SERIES[1],
  SERIES[2],
];

const scheduleAdherence = [
  { week: "W1", adherence: 88 }, { week: "W2", adherence: 91 }, { week: "W3", adherence: 85 },
  { week: "W4", adherence: 89 }, { week: "W5", adherence: 92 }, { week: "W6", adherence: 90 },
  { week: "W7", adherence: 87 }, { week: "W8", adherence: 93 }, { week: "W9", adherence: 91 },
  { week: "W10", adherence: 89 }, { week: "W11", adherence: 94 }, { week: "W12", adherence: 91 },
];

const deadStock = [
  { month: "Apr", value: 48 }, { month: "May", value: 50 }, { month: "Jun", value: 52 },
  { month: "Jul", value: 55 }, { month: "Aug", value: 54 }, { month: "Sep", value: 56 },
  { month: "Oct", value: 58 }, { month: "Nov", value: 60 }, { month: "Dec", value: 59 },
  { month: "Jan", value: 61 }, { month: "Feb", value: 63 }, { month: "Mar", value: 62 },
];

const topVendorSpend = [
  { name: "Reliance", spend: 120 }, { name: "Galaxy", spend: 85 }, { name: "Rashtriya", spend: 72 },
  { name: "Aarti", spend: 68 }, { name: "Mold-Tek", spend: 62 }, { name: "Tronox", spend: 58 },
  { name: "Uflex", spend: 52 }, { name: "Deepak", spend: 48 }, { name: "Givaudan", spend: 42 }, { name: "Gujarat", spend: 38 },
];

export default function BIDashboard() {
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold animate-fade-in-up">Business Intelligence Dashboard</h2>

      <div className="animate-fade-in-up stagger-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inventory Health</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Inventory Value by Category</h4>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={invByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                {invByCategory.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">ABC Analysis</h4>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={abcData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                {abcData.map((_, i) => <Cell key={i} fill={ABC_COLORS[i]} />)}
              </Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Dead Stock Trend (₹L)</h4>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={deadStock}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Area type="monotone" dataKey="value" fill={`${CHART_COLORS.primary}15`} stroke={CHART_COLORS.primary} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Production & Procurement</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-muted-foreground">Schedule Adherence (12 Weeks)</h4>
              <span className="text-xs font-medium text-success">Savings YTD: ₹18.4L</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scheduleAdherence}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Line type="monotone" dataKey="adherence" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Spend by Vendor (₹L, Top 10)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topVendorSpend} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="spend" fill={CHART_COLORS.primary} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
