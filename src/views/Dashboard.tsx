"use client";

import { useRouter } from "next/navigation";
import { Zap, FileText, Package, Shield } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { MetricRow, type Metric } from "@/components/app/metric-row";
import { DataTable, type Column } from "@/components/app/data-table";
import { btnPrimary, btnSecondary } from "@/components/app/controls";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import { traceCompletenessByLine, missingScanExceptions } from "@/data/traceability";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE } from "@/lib/chart-colors";
import { RangePicker } from "@/components/app/chart-card";
import { useSeriesToggle } from "@/lib/chart-config";
import { useState } from "react";

/* The five materials the coverage chart plots, in draw order. */
const COVERAGE_SERIES = ["Polypropylene", "Stearic Acid", "HDPE Resin", "EDTA", "TiO2"] as const;
const COVERAGE_RANGES = ["4W", "8W", "12W"] as const;
type CoverageRange = (typeof COVERAGE_RANGES)[number];

const coverageData = [
  { week: "W1", "Polypropylene": 6.2, "Stearic Acid": 3.1, "HDPE Resin": 8.4, "EDTA": 4.5, "TiO2": 5.1 },
  { week: "W2", "Polypropylene": 5.8, "Stearic Acid": 2.8, "HDPE Resin": 7.9, "EDTA": 4.1, "TiO2": 4.8 },
  { week: "W3", "Polypropylene": 5.1, "Stearic Acid": 2.2, "HDPE Resin": 7.2, "EDTA": 3.8, "TiO2": 4.3 },
  { week: "W4", "Polypropylene": 4.5, "Stearic Acid": 1.8, "HDPE Resin": 6.8, "EDTA": 3.5, "TiO2": 3.9 },
  { week: "W5", "Polypropylene": 5.2, "Stearic Acid": 3.5, "HDPE Resin": 6.2, "EDTA": 3.2, "TiO2": 3.5 },
  { week: "W6", "Polypropylene": 4.8, "Stearic Acid": 3.1, "HDPE Resin": 5.8, "EDTA": 2.9, "TiO2": 3.1 },
  { week: "W7", "Polypropylene": 4.2, "Stearic Acid": 2.6, "HDPE Resin": 5.4, "EDTA": 2.6, "TiO2": 2.8 },
  { week: "W8", "Polypropylene": 3.8, "Stearic Acid": 2.1, "HDPE Resin": 5.1, "EDTA": 2.3, "TiO2": 2.5 },
  { week: "W9", "Polypropylene": 4.5, "Stearic Acid": 1.5, "HDPE Resin": 4.8, "EDTA": 2.1, "TiO2": 2.2 },
  { week: "W10", "Polypropylene": 3.9, "Stearic Acid": 1.2, "HDPE Resin": 4.5, "EDTA": 1.8, "TiO2": 1.9 },
  { week: "W11", "Polypropylene": 3.4, "Stearic Acid": 0.8, "HDPE Resin": 4.2, "EDTA": 1.5, "TiO2": 1.6 },
  { week: "W12", "Polypropylene": 3.1, "Stearic Acid": 0.5, "HDPE Resin": 3.9, "EDTA": 1.2, "TiO2": 1.3 },
];

const stockAlerts = [
  { sku: "Stearic Acid", stock: "180 kg", days: 4.3, reorder: "Immediate" },
  { sku: "Fragrance Blend FG-04", stock: "22 L", days: 3.7, reorder: "Immediate" },
  { sku: "EDTA Disodium Salt", stock: "95 kg", days: 5.1, reorder: "24 Mar 2026" },
  { sku: "Shrink Labels (Type B)", stock: "1,200 pcs", days: 6.2, reorder: "25 Mar 2026" },
  { sku: "Titanium Dioxide", stock: "640 kg", days: 8.2, reorder: "25 Mar 2026" },
  { sku: "Foil Seals 5L", stock: "3,400 pcs", days: 9.1, reorder: "27 Mar 2026" },
  { sku: "Sodium Lauryl Sulphate", stock: "520 kg", days: 11.4, reorder: "30 Mar 2026" },
];

const productionSchedule = [
  { product: "Industrial Cleaner 5L", qty: "2,000", date: "24 Mar", readiness: "green" as const, status: "Confirmed" },
  { product: "Floor Polish 1L", qty: "5,000", date: "24 Mar", readiness: "amber" as const, status: "Confirmed" },
  { product: "Dish Wash Liquid 500ml", qty: "8,000", date: "25 Mar", readiness: "red" as const, status: "At Risk" },
  { product: "Hand Wash 250ml", qty: "10,000", date: "25 Mar", readiness: "green" as const, status: "Confirmed" },
  { product: "Glass Cleaner 1L", qty: "3,000", date: "26 Mar", readiness: "green" as const, status: "Planned" },
  { product: "Toilet Cleaner 500ml", qty: "6,000", date: "27 Mar", readiness: "amber" as const, status: "Planned" },
  { product: "Surface Disinfectant 5L", qty: "1,500", date: "28 Mar", readiness: "green" as const, status: "Planned" },
];

export default function Dashboard() {
  // Windowing the existing twelve weeks — the tail is the recent end, so a
  // shorter range keeps the last N points rather than the first.
  const [coverageRange, setCoverageRange] = useState<CoverageRange>("12W");
  const coverageWindow = coverageData.slice(-parseInt(coverageRange, 10));
  const coverageLegend = useSeriesToggle([...COVERAGE_SERIES]);

  const router = useRouter();
  const [scanExceptions, setScanExceptions] = useState(missingScanExceptions);

  const resolveException = (index: number) => {
    setScanExceptions(prev => prev.map((e, i) => i === index ? { ...e, resolved: true } : e));
  };

  const unresolved = scanExceptions.filter(e => !e.resolved).length;

  // The nine figures that used to be nine bordered cards. Tone is applied only
  // to the ones that need attention, so colour still carries meaning.
  const metrics: Metric[] = [
    { label: "Materials at risk", iconName: "materials-risk", value: "14", hint: "SKUs · up from 9 last week", tone: "danger" },
    { label: "Open purchase orders", iconName: "purchase-orders", value: "87", hint: "₹4.2 Cr value" },
    { label: "Schedule adherence", iconName: "schedule-adherence", value: "91.4%", delta: "2.1%", deltaDirection: "up" },
    { label: "Inventory health", iconName: "inventory-health", value: "74", hint: "of 100 · below 80 target", tone: "warning" },
    { label: "Pending work orders", iconName: "pending-work-orders", value: "23", hint: "6 overdue" },
    { label: "Trace completeness", iconName: "trace-completeness", value: "92.4%", delta: "1.2%", deltaDirection: "up" },
    { label: "Mean RCA time", iconName: "rca-time", value: "14.7", hint: "hrs · target under 12" },
    { label: "Active suspect lots", iconName: "suspect-lots", value: "2", hint: "Up from 0 last week", tone: "danger" },
    { label: "Recall accuracy", iconName: "recall-accuracy", value: "97.1%", hint: "Field containment" },
  ];

  type ScanException = (typeof scanExceptions)[number];
  const exceptionColumns: Column<ScanException>[] = [
    { key: "workOrder", header: "Work order", width: "w-[130px]", value: r => r.workOrder, cell: r => <span className="identifier text-body-sm">{r.workOrder}</span> },
    { key: "part", header: "Part", width: "w-[130px]", value: r => r.part, cell: r => <span className="identifier text-body-sm text-muted-foreground">{r.part}</span> },
    { key: "station", header: "Station", value: r => r.station, cell: r => r.station },
    { key: "shift", header: "Shift", width: "w-[90px]", value: r => r.shift, cell: r => r.shift },
    { key: "date", header: "Date", width: "w-[110px]", value: r => r.date, cell: r => r.date },
    {
      key: "action", header: "", align: "right", width: "w-[110px]",
      cell: r => {
        const i = scanExceptions.indexOf(r);
        return r.resolved
          ? <span className="text-body-sm text-muted-foreground">Resolved</span>
          : <button onClick={() => resolveException(i)} className="h-7 rounded-lg border border-border bg-card px-2.5 text-body-sm font-medium text-foreground transition-colors hover:bg-secondary">Resolve</button>;
      },
    },
  ];

  type Scheduled = (typeof productionSchedule)[number];
  const scheduleColumns: Column<Scheduled>[] = [
    {
      key: "product", header: "Product",
      // Readiness rides with the product name rather than taking a column of
      // its own, which is what made this table overflow its third of the row.
      cell: r => (
        <span className="flex min-w-0 items-center gap-2">
          <span
            title={r.status}
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${r.readiness === "green" ? "bg-success" : r.readiness === "amber" ? "bg-warning" : "bg-danger"}`}
          />
          <span className="truncate">{r.product}</span>
        </span>
      ),
    },
    { key: "qty", header: "Qty", align: "right", numeric: true, width: "w-[72px]", cell: r => r.qty },
    { key: "date", header: "Date", align: "right", width: "w-[76px]", cell: r => <span className="whitespace-nowrap">{r.date}</span> },
  ];

  return (
    <div className="px-6 py-5">
      <PageHeader
        title="Dashboard"
        description="Material planning, production readiness and traceability at a glance."
        actions={
          <>
            <button onClick={() => router.push("/purchase-planning")} className={btnSecondary}>
              <FileText /> Purchase plan
            </button>
            <button onClick={() => router.push("/mrp-run")} className={btnPrimary}>
              <Zap /> Run MRP
            </button>
          </>
        }
      />

      <MetricRow metrics={metrics} />

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Section
          title="Material coverage trend"
          iconName="material-coverage"
          description="Weeks of cover by material"
          actions={<RangePicker<CoverageRange> value={coverageRange} options={COVERAGE_RANGES} onChange={setCoverageRange} />}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={coverageWindow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} tickMargin={6} />
              <YAxis width={44} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} label={{ value: "Weeks of cover", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: CHART_COLORS.axis, textAnchor: "middle" } }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }} formatter={(v: number | string) => (typeof v === "number" ? `${v} weeks` : v)} />
              <ReferenceLine y={2} stroke={CHART_COLORS.primary} strokeDasharray="5 5" label={{ value: "Min 2w", fontSize: 10, fill: CHART_COLORS.primary }} />
              {COVERAGE_SERIES.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={SERIES[i]}
                  strokeWidth={i === 0 ? 2 : 1.5}
                  dot={false}
                  // Hiding is what the legend toggles; the series stays in the
                  // chart so its colour and legend entry do not reshuffle.
                  hide={coverageLegend.isHidden(key)}
                />
              ))}
              {/* Click a name to isolate or restore that material. */}
              <Legend
                iconSize={6}
                wrapperStyle={{ ...CHART_LEGEND_STYLE, cursor: "pointer" }}
                onClick={coverageLegend.onLegendClick}
                formatter={(value: string) => (
                  <span style={{ opacity: coverageLegend.isHidden(value) ? 0.4 : 1 }}>{value}</span>
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Trace completeness by assembly line" iconName="trend-chart" description="Last 7 days">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={traceCompletenessByLine} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} />
              <YAxis width={44} domain={[60, 100]} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
              <Bar dataKey="Line 1" fill={SERIES[0]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 2" fill={SERIES[1]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 3" fill={SERIES[2]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 4" fill={SERIES[3]} radius={[2, 2, 0, 0]} />
              <Legend iconSize={6} wrapperStyle={CHART_LEGEND_STYLE} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Section title="MRP run status">
          <dl className="divide-y divide-border">
            {[
              ["Last run", "23 Mar 2026, 06:30 AM"],
              ["Duration", "4m 12s"],
              ["Planned orders", "312"],
              ["Exceptions", "18"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-2">
                <dt className="text-body-md text-muted-foreground">{k}</dt>
                <dd className="text-body-md font-medium tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          title="Stock exhaustion alerts"
          actions={
            <button onClick={() => router.push("/stock-alerts")} className="text-body-sm text-muted-foreground transition-colors hover:text-foreground">
              View all
            </button>
          }
        >
          <ul className="divide-y divide-border">
            {stockAlerts.slice(0, 7).map(a => (
              <li key={a.sku} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-body-md text-foreground">{a.sku}</span>
                <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">{a.stock} · {a.days}d</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Production schedule" description="Next 7 days">
          <DataTable columns={scheduleColumns} rows={productionSchedule} rowKey={r => r.product} />
        </Section>
      </div>

      <Section className="mt-8" title="Missing scan exceptions" description={`${unresolved} unresolved`}>
        <DataTable columns={exceptionColumns} rows={scanExceptions} rowKey={r => r.workOrder} name="Missing scan exceptions" searchable exportable />
      </Section>

      <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
        {[
          { label: "BOM traceability", icon: Shield, to: "/traceability" },
          { label: "Slow-moving stock", icon: Package, to: "/inventory-health" },
        ].map(({ label, icon: Icon, to }) => (
          <button key={to} onClick={() => router.push(to)} className={btnSecondary}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
