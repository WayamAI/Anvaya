import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";

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
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Business intelligence dashboard</span>
        </h1>

      <div >
        <h3 className="label-caps mb-3 break-words">Inventory health</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>div]:min-w-0">
          <div>
            <h4 className="mb-2 text-body-sm font-medium text-muted-foreground break-words">Inventory value by category</h4>
            <ResponsiveContainer width="100%" height={220} className="[&_.recharts-pie-label-text]:text-[11px]">
              <PieChart><Pie data={invByCategory} isAnimationActive={false} cx="50%" cy="50%" innerRadius={30} outerRadius={44} dataKey="value" label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                {invByCategory.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie><Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 className="mb-2 text-body-sm font-medium text-muted-foreground break-words">ABC analysis</h4>
            <ResponsiveContainer width="100%" height={220} className="[&_.recharts-pie-label-text]:text-[11px]">
              <PieChart><Pie data={abcData} isAnimationActive={false} cx="50%" cy="50%" outerRadius={46} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                {abcData.map((_, i) => <Cell key={i} fill={ABC_COLORS[i]} />)}
              </Pie><Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 className="mb-2 text-body-sm font-medium text-muted-foreground break-words">Dead stock trend (₹L)</h4>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={deadStock} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} minTickGap={0} tickMargin={6} />
                <YAxis tick={{ fontSize: 10 }} width={34} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Area type="monotone" dataKey="value" fill={CHART_COLORS.primary} fillOpacity={0.12} stroke={CHART_COLORS.primary} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div >
        <h3 className="label-caps mb-3 break-words">Production & procurement</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h4 className="min-w-0 text-body-sm font-medium text-muted-foreground">Schedule adherence (12 weeks)</h4>
              <span className="shrink-0 whitespace-nowrap text-body-sm font-medium text-success">Savings YTD: ₹18.4L</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={scheduleAdherence} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={0} minTickGap={0} tickMargin={6} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} width={34} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Line type="monotone" dataKey="adherence" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 className="mb-2 text-body-sm font-medium text-muted-foreground break-words">Spend by vendor (₹L, top 10)</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topVendorSpend} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickMargin={6} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={76} interval={0} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Bar dataKey="spend" radius={[0, 3, 3, 0]}>
                  {topVendorSpend.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? CHART_COLORS.primary : CHART_COLORS.muted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
