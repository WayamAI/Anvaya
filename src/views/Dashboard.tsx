"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ShoppingCart, TrendingUp, Heart, Wrench, Zap, FileText, Package, Shield, Clock, Target, Search } from "lucide-react";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import { traceCompletenessByLine, missingScanExceptions } from "@/data/traceability";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";
import { useState } from "react";

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

const procurementData = [
  { week: "W5", procured: 14200, consumed: 12800 },
  { week: "W6", procured: 11800, consumed: 13200 },
  { week: "W7", procured: 15600, consumed: 13500 },
  { week: "W8", procured: 12400, consumed: 14100 },
  { week: "W9", procured: 16800, consumed: 13900 },
  { week: "W10", procured: 13200, consumed: 14500 },
  { week: "W11", procured: 14800, consumed: 14200 },
  { week: "W12", procured: 11200, consumed: 14800 },
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
  const router = useRouter();
  const [scanExceptions, setScanExceptions] = useState(missingScanExceptions);

  const resolveException = (index: number) => {
    setScanExceptions(prev => prev.map((e, i) => i === index ? { ...e, resolved: true } : e));
  };

  return (
    <div className="p-6 space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4 animate-fade-in-up">
        <KPICard title="Materials at Risk" value="14 SKUs" status="red" trend={{ value: "↑ from 9 last week", direction: "up", positive: false }} icon={AlertTriangle} />
        <KPICard title="Open Purchase Orders" value="87" subtitle="₹4.2 Cr value" status="amber" icon={ShoppingCart} />
        <KPICard title="Schedule Adherence" value="91.4%" status="green" trend={{ value: "+2.1%", direction: "up", positive: true }} icon={TrendingUp} />
        <KPICard title="Inventory Health" value="74 / 100" subtitle="Below 80 target" status="amber" icon={Heart} />
        <KPICard title="Pending Work Orders" value="23" subtitle="6 overdue" status="red" icon={Wrench} />
      </div>

      {/* Traceability Health Row */}
      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <KPICard title="Trace Completeness" value="92.4%" status="green" trend={{ value: "+1.2%", direction: "up", positive: true }} icon={Shield} />
        <KPICard title="Mean RCA Time" value="14.7 hrs" subtitle="Target < 12 hrs" status="amber" icon={Clock} />
        <KPICard title="Active Suspect Lots" value="2" status="red" trend={{ value: "↑ from 0 last week", direction: "up", positive: false }} icon={AlertTriangle} />
        <KPICard title="Recall Accuracy" value="97.1%" subtitle="Field containment" status="green" icon={Target} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in-up stagger-2">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Material Coverage Trend (Weeks)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={coverageData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
              <YAxis tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} label={{ value: "Weeks", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={2} stroke={CHART_COLORS.primary} strokeDasharray="5 5" label={{ value: "Min 2w", fontSize: 10, fill: CHART_COLORS.primary }} />
              <Line type="monotone" dataKey="Polypropylene" stroke={SERIES[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Stearic Acid" stroke={SERIES[1]} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="HDPE Resin" stroke={SERIES[2]} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="EDTA" stroke={SERIES[3]} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="TiO2" stroke={SERIES[4]} strokeWidth={1.5} dot={false} />
              <Legend iconSize={6} wrapperStyle={{ fontSize: 10, color: "hsl(0, 0%, 55%)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trace Completeness by Line */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Trace Completeness by Assembly Line (7d)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={traceCompletenessByLine}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
              <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="Line 1" fill={SERIES[0]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 2" fill={SERIES[1]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 3" fill={SERIES[2]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Line 4" fill={SERIES[3]} radius={[2, 2, 0, 0]} />
              <Legend iconSize={6} wrapperStyle={{ fontSize: 10, color: "hsl(0, 0%, 55%)" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Third Row */}
      <div className="grid grid-cols-3 gap-4 animate-fade-in-up stagger-3">
        {/* MRP Status */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">MRP Run Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Last Run</span><span className="font-medium">23 Mar 2026, 06:30 AM</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">4m 12s</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Planned Orders</span><span className="font-medium">312</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Exceptions</span><span className="font-medium">18</span></div>
          </div>
          <button onClick={() => router.push("/mrp-run")} className="mt-4 w-full h-9 bg-accent text-accent-foreground rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity active:scale-[0.98]">
            <Zap className="w-3.5 h-3.5" /> Re-run MRP Now
          </button>
        </div>

        {/* Stock Alerts */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Stock Exhaustion Alerts</h3>
            <button onClick={() => router.push("/stock-alerts")} className="text-xs text-accent hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {stockAlerts.slice(0, 7).map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{a.sku}</span>
                  <span className="text-muted-foreground">{a.stock} · {a.days}d</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Production Schedule */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Production Schedule (Next 7 Days)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border">
                <th className="text-left py-1.5 font-medium text-muted-foreground">Product</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">Qty</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">Date</th>
                <th className="text-center py-1.5 font-medium text-muted-foreground">Ready</th>
              </tr></thead>
              <tbody>
                {productionSchedule.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="py-1.5 truncate max-w-[120px]">{p.product}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.qty}</td>
                    <td className="py-1.5 text-right">{p.date}</td>
                    <td className="py-1.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${p.readiness === "green" ? "bg-success" : p.readiness === "amber" ? "bg-warning" : "bg-danger"}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Missing Scan Exceptions Table */}
      <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Search className="w-4 h-4 text-muted-foreground" /> Missing Scan Exceptions
          </h3>
          <span className="text-xs text-muted-foreground">{scanExceptions.filter(e => !e.resolved).length} unresolved</span>
        </div>
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["Work Order", "Part", "Station", "Shift", "Date", "Action"].map(h =>
              <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
            )}
          </tr></thead>
          <tbody>
            {scanExceptions.map((e, i) => (
              <tr key={i} className={`border-b border-border ${e.resolved ? "opacity-40" : "hover:bg-secondary/30"}`}>
                <td className="px-3 py-2 font-mono text-xs text-accent">{e.workOrder}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.part}</td>
                <td className="px-3 py-2">{e.station}</td>
                <td className="px-3 py-2">{e.shift}</td>
                <td className="px-3 py-2">{e.date}</td>
                <td className="px-3 py-2">
                  {!e.resolved ? (
                    <button onClick={() => resolveException(i)} className="h-6 px-2 bg-accent text-accent-foreground rounded text-xs font-medium hover:opacity-90">Resolve</button>
                  ) : (
                    <span className="text-xs text-muted-foreground font-medium">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 animate-fade-in-up stagger-5">
        <button onClick={() => router.push("/mrp-run")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98] flex items-center gap-2">
          <Zap className="w-4 h-4" /> Run MRP
        </button>
        <button onClick={() => router.push("/purchase-planning")} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98] flex items-center gap-2">
          <FileText className="w-4 h-4" /> Review Purchase Plan
        </button>
        <button onClick={() => router.push("/traceability")} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98] flex items-center gap-2">
          <Shield className="w-4 h-4" /> BOM Traceability
        </button>
        <button onClick={() => router.push("/inventory-health")} className="px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98] flex items-center gap-2">
          <Package className="w-4 h-4" /> Check Slow-Moving Stock
        </button>
      </div>
    </div>
  );
}
