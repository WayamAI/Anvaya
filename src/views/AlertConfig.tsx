"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Mail, MessageSquare } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { traceabilityAlerts } from "@/data/traceability";
import { PageIcon } from "@/components/app/page-icon";

const alertRules = [
  { name: "Stock Exhaustion — Critical", trigger: "Coverage < 3 days", channel: "Email + SMS + In-App", recipients: "Planner, Procurement Head", frequency: "Immediate", enabled: true },
  { name: "Stock Exhaustion — High", trigger: "Coverage 3–7 days", channel: "Email + In-App", recipients: "Planner", frequency: "Daily digest", enabled: true },
  { name: "Stock Exhaustion — Medium", trigger: "Coverage 7–14 days", channel: "In-App", recipients: "Planner", frequency: "Weekly digest", enabled: true },
  { name: "PO Overdue", trigger: "Expected delivery passed", channel: "Email + In-App", recipients: "Procurement", frequency: "Daily", enabled: true },
  { name: "MRP Exception — High", trigger: "High severity exception generated", channel: "Email + SMS", recipients: "Planner, Operations", frequency: "Immediate", enabled: true },
  { name: "Production Delay", trigger: "Work order behind schedule > 4h", channel: "Email + SMS", recipients: "Operations, Plant Head", frequency: "Immediate", enabled: true },
  { name: "Quality Hold", trigger: "QC test failure or quarantine batch", channel: "Email + In-App", recipients: "Quality, Operations", frequency: "Immediate", enabled: true },
  { name: "Batch Expiry Warning", trigger: "Batch expiring in < 30 days", channel: "Email", recipients: "Warehouse, Sales", frequency: "Weekly", enabled: true },
  { name: "Price Variance Alert", trigger: "PO price > 5% above last price", channel: "Email", recipients: "Procurement Head, Finance", frequency: "Per PO", enabled: false },
  { name: "Dead Stock Alert", trigger: "No movement > 90 days", channel: "In-App", recipients: "Planner, Finance", frequency: "Monthly", enabled: true },
  { name: "Integration Failure", trigger: "Sync failure or degraded status", channel: "Email + SMS", recipients: "IT Admin", frequency: "Immediate", enabled: true },
  { name: "Capacity Overload", trigger: "Production line > 100% scheduled", channel: "Email", recipients: "Operations", frequency: "Daily", enabled: false },
  // Traceability alert rules
  { name: "Suspect Lot in Production", trigger: "Failed/quarantine lot consumed in WO", channel: "Email + SMS + In-App", recipients: "Quality, Operations, Plant Head", frequency: "Immediate", enabled: true },
  { name: "Revision Mismatch at Assembly", trigger: "Build uses non-current EBOM rev", channel: "Email + SMS + In-App", recipients: "Quality, Engineering", frequency: "Immediate", enabled: true },
  { name: "Lot Scan Coverage Below Threshold", trigger: "Line scan coverage < 90%", channel: "Email + In-App", recipients: "Operations, Quality", frequency: "Per Shift", enabled: true },
  { name: "Non-ASL Supplier Lot Consumed", trigger: "Lot from unapproved supplier used", channel: "Email + SMS", recipients: "Quality, Procurement", frequency: "Immediate", enabled: true },
  { name: "Field Return Cluster", trigger: "≥3 returns on same lot in 7 days", channel: "Email + SMS + In-App", recipients: "Quality, Plant Head, Sales", frequency: "Immediate", enabled: true },
  { name: "ECO Effectivity Approaching", trigger: "Revision effectivity ends in < 30 days", channel: "Email", recipients: "Engineering, Quality", frequency: "Weekly", enabled: true },
  { name: "Supplier Lot Expiry", trigger: "Lot expires in < 60 days", channel: "Email + In-App", recipients: "Warehouse, Quality", frequency: "Weekly", enabled: true },
];

const severityColors: Record<string, "red" | "amber" | "green" | "gray"> = {
  critical: "red",
  high: "amber",
  medium: "gray",
};

export default function AlertConfig() {
  const [rules, setRules] = useState(alertRules);
  const [activeTab, setActiveTab] = useState<"rules" | "feed">("rules");
  const router = useRouter();

  const toggleRule = (index: number) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, enabled: !r.enabled } : r));
  };

  const criticalOpen = traceabilityAlerts.filter(a => a.severity === "critical" && !a.resolved);

  return (
    <div className="px-6 py-5 space-y-6">
      {/* Critical banner */}
      {criticalOpen.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-danger font-semibold text-body-md">⚠ {criticalOpen.length} critical traceability alert{criticalOpen.length > 1 ? "s" : ""} open</span>
          <button onClick={() => setActiveTab("feed")} className="text-body-sm text-danger hover:underline ml-auto">View alerts →</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Alert configuration</span>
        </h1>

      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[{ key: "rules" as const, label: "Alert rules" }, { key: "feed" as const, label: `Alert feed (${traceabilityAlerts.filter(a => !a.resolved).length})` }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-body-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === "rules" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: Bell, label: "Active alert rules", count: rules.filter(r => r.enabled).length, total: rules.length },
              { icon: Mail, label: "Email alerts sent (today)", count: 47, total: null },
              { icon: MessageSquare, label: "SMS alerts sent (today)", count: 8, total: null },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <s.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-display-lg font-semibold tabular-nums">{s.count}{s.total !== null && <span className="text-body-md text-muted-foreground font-normal"> / {s.total}</span>}</div>
                  <div className="text-body-sm text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-body-md">
              <thead><tr className="border-b border-border">
                {["Enabled", "Alert rule", "Trigger condition", "Channel", "Recipients", "Frequency"].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={i} className={`border-b border-border hover:bg-sunken ${!r.enabled ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleRule(i)} className={`w-8 h-4.5 rounded-full transition-colors relative ${r.enabled ? "bg-primary" : "bg-muted"}`}>
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-card shadow transition-transform ${r.enabled ? "left-4" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.trigger}</td>
                    <td className="px-3 py-2 text-body-sm">{r.channel}</td>
                    <td className="px-3 py-2 text-body-sm">{r.recipients}</td>
                    <td className="px-3 py-2">{r.frequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "feed" && (
        <div className="space-y-3">
          {traceabilityAlerts.map(a => (
            <div key={a.id} className={`bg-card rounded-lg border p-4 ${a.severity === "critical" ? "border-danger/40 bg-danger/5" : a.severity === "high" ? "border-warning/40" : "border-border"} ${a.resolved ? "opacity-40" : ""}`}>
              <div className="flex items-start gap-3">
                <StatusBadge status={severityColors[a.severity]} label={a.severity.toUpperCase()} />
                <div className="flex-1 min-w-0">
                  <div className="text-body-md font-medium">{a.title}</div>
                  <div className="text-body-sm text-muted-foreground mt-0.5">{a.description}</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-caption text-muted-foreground">{new Date(a.timestamp).toLocaleString("en-IN")}</span>
                    {a.relatedLot && (
                      <button onClick={() => router.push(`/traceability?search=${a.relatedLot}`)}
                        className="text-caption identifier bg-sbom/10 text-sbom px-1.5 py-0.5 rounded hover:bg-sbom/20">{a.relatedLot}</button>
                    )}
                    {a.relatedSerial && (
                      <button onClick={() => router.push(`/traceability?search=${a.relatedSerial}`)}
                        className="text-caption identifier bg-mbom/10 text-mbom px-1.5 py-0.5 rounded hover:bg-mbom/20">{a.relatedSerial}</button>
                    )}
                    {a.relatedPart && (
                      <button onClick={() => router.push(`/traceability?search=${a.relatedPart}`)}
                        className="text-caption identifier bg-ebom/10 text-ebom px-1.5 py-0.5 rounded hover:bg-ebom/20">{a.relatedPart}</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
