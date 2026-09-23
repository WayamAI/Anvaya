import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Activity, RefreshCw, Settings, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Clock, Database, Zap, Calendar, BarChart3,
  ShieldCheck, ExternalLink, Pause, Play, RotateCcw
} from "lucide-react";

type SyncDirection = "inbound" | "outbound" | "bidirectional";
type IntegrationStatus = "active" | "degraded" | "error" | "paused";

interface SyncEvent {
  timestamp: string;
  records: number;
  status: "success" | "partial" | "failed";
  duration: string;
  errors?: number;
  errorDetail?: string;
}

interface DataFlow {
  entity: string;
  direction: SyncDirection;
  lastCount: number;
  todayCount: number;
  errorRate: number;
}

interface Integration {
  id: string;
  name: string;
  category: "accounting" | "commerce" | "compliance" | "logistics" | "quality" | "hr" | "communication";
  desc: string;
  status: IntegrationStatus;
  statusLabel: string;
  syncType: "Real-time" | "Scheduled";
  syncInterval?: string;
  icon: string;
  uptime: number;
  avgLatency: string;
  totalRecords: string;
  todayRecords: number;
  errorRate: number;
  lastSync: string;
  nextSync?: string;
  warning?: string;
  dataFlows: DataFlow[];
  recentSyncs: SyncEvent[];
  apiVersion: string;
  authMethod: string;
  rateLimit: string;
  rateLimitUsed: number;
}

const integrations: Integration[] = [
  {
    id: "tally", name: "Tally Prime", category: "accounting",
    desc: "Core accounting backbone — purchase invoices, GRNs, stock ledger, and cost centre sync",
    status: "active", statusLabel: "Healthy", syncType: "Real-time", icon: "💰",
    uptime: 99.94, avgLatency: "180ms", totalRecords: "1,24,500", todayRecords: 342,
    errorRate: 0.02, lastSync: "2 min ago",
    apiVersion: "v3.2", authMethod: "OAuth 2.0", rateLimit: "5,000/hr", rateLimitUsed: 12,
    dataFlows: [
      { entity: "Purchase Invoices", direction: "inbound", lastCount: 48200, todayCount: 85, errorRate: 0 },
      { entity: "GRN Entries", direction: "inbound", lastCount: 32100, todayCount: 112, errorRate: 0.01 },
      { entity: "Stock Values", direction: "inbound", lastCount: 28400, todayCount: 98, errorRate: 0 },
      { entity: "Cost Centres", direction: "outbound", lastCount: 15800, todayCount: 47, errorRate: 0.05 },
    ],
    recentSyncs: [
      { timestamp: "10:42 AM", records: 28, status: "success", duration: "1.2s" },
      { timestamp: "10:40 AM", records: 15, status: "success", duration: "0.8s" },
      { timestamp: "10:38 AM", records: 42, status: "success", duration: "1.8s" },
      { timestamp: "10:35 AM", records: 31, status: "success", duration: "1.1s" },
      { timestamp: "10:32 AM", records: 8, status: "success", duration: "0.4s" },
    ],
  },
  {
    id: "zoho", name: "Zoho Books", category: "accounting",
    desc: "Secondary accounting — journal entries, bank reconciliation, tax reports",
    status: "degraded", statusLabel: "Degraded", syncType: "Scheduled", syncInterval: "4h", icon: "📗",
    uptime: 97.2, avgLatency: "2.4s", totalRecords: "82,000", todayRecords: 0,
    errorRate: 1.7, lastSync: "3 hrs ago", nextSync: "In 1 hr",
    warning: "14 records failed validation — schema mismatch on tax_code field since Zoho API v2.8 update",
    apiVersion: "v2.8", authMethod: "OAuth 2.0", rateLimit: "2,000/hr", rateLimitUsed: 0,
    dataFlows: [
      { entity: "Journal Entries", direction: "inbound", lastCount: 34500, todayCount: 0, errorRate: 2.1 },
      { entity: "Bank Reconciliation", direction: "inbound", lastCount: 22800, todayCount: 0, errorRate: 0 },
      { entity: "Tax Reports", direction: "outbound", lastCount: 24700, todayCount: 0, errorRate: 3.2 },
    ],
    recentSyncs: [
      { timestamp: "07:00 AM", records: 156, status: "partial", duration: "18.2s", errors: 14, errorDetail: "tax_code validation" },
      { timestamp: "03:00 AM", records: 201, status: "success", duration: "22.1s" },
      { timestamp: "Yesterday 11:00 PM", records: 189, status: "success", duration: "19.8s" },
      { timestamp: "Yesterday 07:00 PM", records: 178, status: "success", duration: "20.4s" },
      { timestamp: "Yesterday 03:00 PM", records: 210, status: "partial", duration: "24.1s", errors: 3, errorDetail: "tax_code validation" },
    ],
  },
  {
    id: "woo", name: "WooCommerce", category: "commerce",
    desc: "Primary e-commerce channel — sales order intake, inventory publish, pricing sync",
    status: "active", statusLabel: "Healthy", syncType: "Real-time", icon: "🛒",
    uptime: 99.88, avgLatency: "320ms", totalRecords: "32,800", todayRecords: 28,
    errorRate: 0.08, lastSync: "5 min ago",
    apiVersion: "REST v3", authMethod: "API Key", rateLimit: "10,000/hr", rateLimitUsed: 4,
    dataFlows: [
      { entity: "Sales Orders", direction: "inbound", lastCount: 18200, todayCount: 18, errorRate: 0 },
      { entity: "Inventory Levels", direction: "outbound", lastCount: 8400, todayCount: 6, errorRate: 0.2 },
      { entity: "Product Pricing", direction: "outbound", lastCount: 6200, todayCount: 4, errorRate: 0 },
    ],
    recentSyncs: [
      { timestamp: "10:38 AM", records: 4, status: "success", duration: "0.6s" },
      { timestamp: "10:31 AM", records: 2, status: "success", duration: "0.3s" },
      { timestamp: "10:25 AM", records: 6, status: "success", duration: "0.9s" },
      { timestamp: "10:18 AM", records: 3, status: "success", duration: "0.5s" },
      { timestamp: "10:12 AM", records: 5, status: "success", duration: "0.7s" },
    ],
  },
  {
    id: "amazon", name: "Amazon Seller Central", category: "commerce",
    desc: "Marketplace channel — order fulfilment, FBA inventory, A2A returns processing",
    status: "active", statusLabel: "Healthy", syncType: "Real-time", icon: "📦",
    uptime: 99.91, avgLatency: "450ms", totalRecords: "18,400", todayRecords: 15,
    errorRate: 0.12, lastSync: "12 min ago",
    apiVersion: "SP-API v2024", authMethod: "IAM + OAuth", rateLimit: "3,000/hr", rateLimitUsed: 8,
    dataFlows: [
      { entity: "Orders", direction: "inbound", lastCount: 9800, todayCount: 10, errorRate: 0 },
      { entity: "FBA Inventory", direction: "bidirectional", lastCount: 4200, todayCount: 3, errorRate: 0.3 },
      { entity: "Returns", direction: "inbound", lastCount: 4400, todayCount: 2, errorRate: 0 },
    ],
    recentSyncs: [
      { timestamp: "10:30 AM", records: 3, status: "success", duration: "1.1s" },
      { timestamp: "10:18 AM", records: 5, status: "success", duration: "1.4s" },
      { timestamp: "10:05 AM", records: 2, status: "success", duration: "0.8s" },
      { timestamp: "09:52 AM", records: 4, status: "success", duration: "1.2s" },
      { timestamp: "09:40 AM", records: 1, status: "success", duration: "0.5s" },
    ],
  },
  {
    id: "gst", name: "GSTN Portal", category: "compliance",
    desc: "GST compliance — e-invoicing, e-way bills, GSTR-1/3B filing, ITC reconciliation",
    status: "active", statusLabel: "Healthy", syncType: "Scheduled", syncInterval: "1h", icon: "🏛️",
    uptime: 99.6, avgLatency: "1.8s", totalRecords: "61,200", todayRecords: 45,
    errorRate: 0.3, lastSync: "1 hr ago", nextSync: "In 15 min",
    apiVersion: "NIC v1.04", authMethod: "Digital Signature", rateLimit: "1,000/hr", rateLimitUsed: 22,
    dataFlows: [
      { entity: "E-Invoices", direction: "outbound", lastCount: 28400, todayCount: 22, errorRate: 0.1 },
      { entity: "E-Way Bills", direction: "outbound", lastCount: 18200, todayCount: 12, errorRate: 0.5 },
      { entity: "GSTR Returns", direction: "bidirectional", lastCount: 14600, todayCount: 11, errorRate: 0.2 },
    ],
    recentSyncs: [
      { timestamp: "09:45 AM", records: 45, status: "success", duration: "8.2s" },
      { timestamp: "08:45 AM", records: 38, status: "success", duration: "7.1s" },
      { timestamp: "07:45 AM", records: 52, status: "success", duration: "9.4s" },
      { timestamp: "06:45 AM", records: 41, status: "success", duration: "7.8s" },
      { timestamp: "05:45 AM", records: 29, status: "success", duration: "5.2s" },
    ],
  },
  {
    id: "indiamart", name: "IndiaMART", category: "commerce",
    desc: "Lead capture — buyer enquiries, RFQ intake, lead scoring and auto-assignment",
    status: "active", statusLabel: "Healthy", syncType: "Scheduled", syncInterval: "30m", icon: "🏪",
    uptime: 99.5, avgLatency: "890ms", totalRecords: "8,900", todayRecords: 8,
    errorRate: 0.45, lastSync: "30 min ago", nextSync: "In 12 min",
    apiVersion: "Lead API v2", authMethod: "API Key", rateLimit: "500/hr", rateLimitUsed: 6,
    dataFlows: [
      { entity: "Buyer Enquiries", direction: "inbound", lastCount: 5600, todayCount: 5, errorRate: 0.3 },
      { entity: "RFQ Intake", direction: "inbound", lastCount: 3300, todayCount: 3, errorRate: 0.8 },
    ],
    recentSyncs: [
      { timestamp: "10:12 AM", records: 8, status: "success", duration: "2.1s" },
      { timestamp: "09:42 AM", records: 5, status: "success", duration: "1.4s" },
      { timestamp: "09:12 AM", records: 11, status: "success", duration: "2.8s" },
      { timestamp: "08:42 AM", records: 3, status: "success", duration: "0.9s" },
      { timestamp: "08:12 AM", records: 7, status: "success", duration: "1.8s" },
    ],
  },
  {
    id: "tms", name: "Transport Management", category: "logistics",
    desc: "Dispatch pipeline — shipment booking, vehicle tracking, POD capture, freight reconciliation",
    status: "error", statusLabel: "Error", syncType: "Real-time", icon: "🚛",
    uptime: 92.1, avgLatency: "—", totalRecords: "45,600", todayRecords: 0,
    errorRate: 100, lastSync: "6 hrs ago",
    warning: "API rate limit exceeded at 06:18 AM — 429 Too Many Requests. Auto-retry in backoff. Last successful batch: 186 records.",
    apiVersion: "REST v2.1", authMethod: "OAuth 2.0", rateLimit: "1,500/hr", rateLimitUsed: 100,
    dataFlows: [
      { entity: "Shipment Bookings", direction: "outbound", lastCount: 18900, todayCount: 0, errorRate: 100 },
      { entity: "Vehicle Tracking", direction: "inbound", lastCount: 14200, todayCount: 0, errorRate: 100 },
      { entity: "POD Capture", direction: "inbound", lastCount: 12500, todayCount: 0, errorRate: 100 },
    ],
    recentSyncs: [
      { timestamp: "06:18 AM", records: 0, status: "failed", duration: "—", errors: 186, errorDetail: "429 Too Many Requests" },
      { timestamp: "06:15 AM", records: 186, status: "success", duration: "12.4s" },
      { timestamp: "06:10 AM", records: 142, status: "success", duration: "9.8s" },
      { timestamp: "06:05 AM", records: 198, status: "success", duration: "14.1s" },
      { timestamp: "06:00 AM", records: 167, status: "success", duration: "11.2s" },
    ],
  },
  {
    id: "qms", name: "Quality Management", category: "quality",
    desc: "QC pipeline — inspection results, rejection data, CAPA tracking, CoA validation",
    status: "active", statusLabel: "Healthy", syncType: "Real-time", icon: "✅",
    uptime: 99.97, avgLatency: "95ms", totalRecords: "23,400", todayRecords: 12,
    errorRate: 0, lastSync: "25 min ago",
    apiVersion: "GraphQL v4", authMethod: "JWT", rateLimit: "8,000/hr", rateLimitUsed: 2,
    dataFlows: [
      { entity: "Inspection Results", direction: "inbound", lastCount: 12800, todayCount: 7, errorRate: 0 },
      { entity: "Rejection Data", direction: "inbound", lastCount: 6200, todayCount: 3, errorRate: 0 },
      { entity: "CAPA Records", direction: "bidirectional", lastCount: 4400, todayCount: 2, errorRate: 0 },
    ],
    recentSyncs: [
      { timestamp: "10:18 AM", records: 4, status: "success", duration: "0.2s" },
      { timestamp: "09:55 AM", records: 3, status: "success", duration: "0.1s" },
      { timestamp: "09:30 AM", records: 5, status: "success", duration: "0.3s" },
      { timestamp: "09:10 AM", records: 2, status: "success", duration: "0.1s" },
      { timestamp: "08:48 AM", records: 6, status: "success", duration: "0.4s" },
    ],
  },
  {
    id: "hr", name: "HR & Payroll", category: "hr",
    desc: "Workforce data — shift rosters, attendance, manpower allocation, overtime tracking",
    status: "active", statusLabel: "Healthy", syncType: "Scheduled", syncInterval: "6h", icon: "👥",
    uptime: 99.8, avgLatency: "1.2s", totalRecords: "11,200", todayRecords: 0,
    errorRate: 0, lastSync: "2 hrs ago", nextSync: "In 4 hrs",
    apiVersion: "REST v1.5", authMethod: "API Key", rateLimit: "500/hr", rateLimitUsed: 0,
    dataFlows: [
      { entity: "Shift Rosters", direction: "inbound", lastCount: 4800, todayCount: 0, errorRate: 0 },
      { entity: "Attendance", direction: "inbound", lastCount: 3600, todayCount: 0, errorRate: 0 },
      { entity: "Overtime", direction: "inbound", lastCount: 2800, todayCount: 0, errorRate: 0 },
    ],
    recentSyncs: [
      { timestamp: "08:00 AM", records: 124, status: "success", duration: "4.2s" },
      { timestamp: "02:00 AM", records: 118, status: "success", duration: "3.8s" },
      { timestamp: "Yesterday 08:00 PM", records: 132, status: "success", duration: "4.5s" },
      { timestamp: "Yesterday 02:00 PM", records: 109, status: "success", duration: "3.6s" },
      { timestamp: "Yesterday 08:00 AM", records: 141, status: "success", duration: "4.8s" },
    ],
  },
  {
    id: "email", name: "Email / SMS Gateway", category: "communication",
    desc: "Alert delivery — stockout warnings, PO approvals, dispatch confirmations, QC alerts",
    status: "active", statusLabel: "Healthy", syncType: "Real-time", icon: "📧",
    uptime: 99.99, avgLatency: "42ms", totalRecords: "1,58,000", todayRecords: 124,
    errorRate: 0.01, lastSync: "Just now",
    apiVersion: "SMTP + REST", authMethod: "API Key", rateLimit: "50,000/hr", rateLimitUsed: 1,
    dataFlows: [
      { entity: "Email Alerts", direction: "outbound", lastCount: 98200, todayCount: 82, errorRate: 0 },
      { entity: "SMS Notifications", direction: "outbound", lastCount: 42600, todayCount: 31, errorRate: 0.02 },
      { entity: "WhatsApp Messages", direction: "outbound", lastCount: 17200, todayCount: 11, errorRate: 0 },
    ],
    recentSyncs: [
      { timestamp: "10:43 AM", records: 3, status: "success", duration: "0.04s" },
      { timestamp: "10:42 AM", records: 1, status: "success", duration: "0.03s" },
      { timestamp: "10:40 AM", records: 5, status: "success", duration: "0.05s" },
      { timestamp: "10:38 AM", records: 2, status: "success", duration: "0.03s" },
      { timestamp: "10:35 AM", records: 4, status: "success", duration: "0.04s" },
    ],
  },
];

const categoryLabels: Record<string, string> = {
  accounting: "Financial",
  commerce: "Commerce",
  compliance: "Compliance",
  logistics: "Logistics",
  quality: "Quality",
  hr: "Workforce",
  communication: "Notifications",
};

const statusConfig: Record<IntegrationStatus, { color: "green" | "amber" | "red" | "gray"; icon: typeof CheckCircle2 }> = {
  active: { color: "green", icon: CheckCircle2 },
  degraded: { color: "amber", icon: AlertTriangle },
  error: { color: "red", icon: AlertTriangle },
  paused: { color: "gray", icon: Pause },
};

const directionIcon = (d: SyncDirection) =>
  d === "inbound" ? <ArrowDownRight className="w-3 h-3 text-chart-1" /> :
  d === "outbound" ? <ArrowUpRight className="w-3 h-3 text-muted-foreground" /> :
  <RefreshCw className="w-3 h-3 text-ebom" />;

const directionLabel = (d: SyncDirection) =>
  d === "inbound" ? "IN" : d === "outbound" ? "OUT" : "BI";

function SyncEventRow({ evt }: { evt: SyncEvent }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-body-sm border-b border-border last:border-0">
      <span className="text-muted-foreground w-28 shrink-0">{evt.timestamp}</span>
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        evt.status === "success" ? "bg-success" : evt.status === "partial" ? "bg-warning" : "bg-danger"
      }`} />
      <span className="font-medium tabular-nums w-16">{evt.records} rec</span>
      <span className="text-muted-foreground tabular-nums w-14">{evt.duration}</span>
      {evt.errors && (
        <span className="text-danger font-medium">{evt.errors} errors — {evt.errorDetail}</span>
      )}
    </div>
  );
}

function IntegrationCard({ int, isExpanded, onToggle }: { int: Integration; isExpanded: boolean; onToggle: () => void }) {
  const cfg = statusConfig[int.status];
  const StatusIcon = cfg.icon;

  return (
    <div className={`bg-card rounded-lg border transition-all ${
      int.status === "error" ? "border-danger/40" :
      int.status === "degraded" ? "border-warning/40" : "border-border"
    }`}>
      {/* Header */}
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <div className="text-display-xl mt-0.5">{int.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-heading-sm text-foreground">{int.name}</h3>
              <StatusBadge status={cfg.color} label={int.statusLabel} />
              <Badge variant="outline" className="text-caption px-1.5 py-0 h-4 font-normal text-muted-foreground">
                {categoryLabels[int.category]}
              </Badge>
            </div>
            <p className="text-body-sm text-muted-foreground mb-3">{int.desc}</p>

            {/* Metrics row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-body-sm">
              <div>
                <span className="text-muted-foreground block">Uptime</span>
                <span className={`font-semibold tabular-nums ${int.uptime >= 99.5 ? "text-success" : int.uptime >= 97 ? "text-warning" : "text-danger"}`}>
                  {int.uptime}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Latency</span>
                <span className="font-semibold tabular-nums">{int.avgLatency}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Today</span>
                <span className="font-semibold tabular-nums">{int.todayRecords.toLocaleString("en-IN")} rec</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Error rate</span>
                <span className={`font-semibold tabular-nums ${int.errorRate === 0 ? "text-success" : int.errorRate < 1 ? "text-foreground" : "text-danger"}`}>
                  {int.errorRate}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Last sync</span>
                <span className="font-semibold">{int.lastSync}</span>
              </div>
            </div>

            {/* Rate limit bar */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-caption text-muted-foreground w-20 shrink-0">Rate limit</span>
              <Progress value={int.rateLimitUsed} className="h-1.5 flex-1" />
              <span className="text-caption text-muted-foreground tabular-nums w-8 text-right">{int.rateLimitUsed}%</span>
            </div>
          </div>
          <button className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Warning banner */}
        {int.warning && (
          <div className={`mt-3 ml-10 px-3 py-2 rounded text-body-sm font-medium flex items-start gap-2 ${
            int.status === "error" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          }`}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{int.warning}</span>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border px-4 pb-4">
          <Tabs defaultValue="flows" className="mt-3">
            <TabsList className="h-8">
              <TabsTrigger value="flows" className="text-body-sm h-7 px-3">Data flows</TabsTrigger>
              <TabsTrigger value="history" className="text-body-sm h-7 px-3">Sync history</TabsTrigger>
              <TabsTrigger value="config" className="text-body-sm h-7 px-3">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="flows" className="mt-3">
              <div className="space-y-2">
                {int.dataFlows.map((flow, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 text-body-sm">
                    <div className="flex items-center gap-1.5 w-32 shrink-0">
                      {directionIcon(flow.direction)}
                      <Badge variant="outline" className="text-caption px-1 py-0 h-3.5 identifier">{directionLabel(flow.direction)}</Badge>
                      <span className="font-medium truncate">{flow.entity}</span>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-semibold tabular-nums">{flow.lastCount.toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Today: </span>
                        <span className="font-semibold tabular-nums">{flow.todayCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Errors: </span>
                        <span className={`font-semibold tabular-nums ${flow.errorRate > 0 ? "text-danger" : "text-success"}`}>
                          {flow.errorRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-3">
              <div className="rounded-lg border border-border p-3">
                {int.recentSyncs.map((evt, i) => (
                  <SyncEventRow key={i} evt={evt} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="config" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-body-sm p-3 bg-secondary/50 rounded-lg">
                <div className="flex justify-between"><span className="text-muted-foreground">API version</span><span className="font-medium">{int.apiVersion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Auth method</span><span className="font-medium">{int.authMethod}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sync type</span><span className="font-medium">{int.syncType}{int.syncInterval ? ` (${int.syncInterval})` : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rate limit</span><span className="font-medium">{int.rateLimit}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total records</span><span className="font-medium">{int.totalRecords}</span></div>
                {int.nextSync && <div className="flex justify-between"><span className="text-muted-foreground">Next sync</span><span className="font-medium">{int.nextSync}</span></div>}
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="text-body-sm h-7 gap-1.5">
                  <RotateCcw className="w-3 h-3" /> Force Sync
                </Button>
                <Button variant="outline" size="sm" className="text-body-sm h-7 gap-1.5">
                  <Settings className="w-3 h-3" /> Settings
                </Button>
                <Button variant="outline" size="sm" className="text-body-sm h-7 gap-1.5">
                  <ExternalLink className="w-3 h-3" /> API Docs
                </Button>
                {int.status === "active" ? (
                  <Button variant="outline" size="sm" className="text-body-sm h-7 gap-1.5 text-warning border-warning/30 hover:bg-warning/10">
                    <Pause className="w-3 h-3" /> Pause
                  </Button>
                ) : int.status === "paused" ? (
                  <Button variant="outline" size="sm" className="text-body-sm h-7 gap-1.5 text-success border-success/30 hover:bg-success/10">
                    <Play className="w-3 h-3" /> Resume
                  </Button>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

export default function Integrations() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState("all");

  const activeCount = integrations.filter(i => i.status === "active").length;
  const degradedCount = integrations.filter(i => i.status === "degraded").length;
  const errorCount = integrations.filter(i => i.status === "error").length;
  const todayTotal = integrations.reduce((s, i) => s + i.todayRecords, 0);
  const avgUptime = (integrations.reduce((s, i) => s + i.uptime, 0) / integrations.length).toFixed(1);

  const filtered = filterTab === "all" ? integrations :
    filterTab === "issues" ? integrations.filter(i => i.status !== "active") :
    integrations.filter(i => i.category === filterTab);

  return (
    <div className="px-6 py-5">
      {/* Header */}
      <PageHeader
        title="Integration Hub"
        description="Live monitoring of all external data pipelines connected to Anvaya"
        actions={
          <>
            <Button variant="outline" size="sm">
              <RefreshCw /> Sync All
            </Button>
            <Button size="sm">
              <Zap /> Add Integration
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Active pipelines", value: `${activeCount}/${integrations.length}`, icon: Activity, accent: "text-success" },
          { label: "Degraded", value: degradedCount, icon: AlertTriangle, accent: degradedCount > 0 ? "text-warning" : "text-success" },
          { label: "Errors", value: errorCount, icon: AlertTriangle, accent: errorCount > 0 ? "text-danger" : "text-success" },
          { label: "Records today", value: todayTotal.toLocaleString("en-IN"), icon: Database, accent: "text-foreground" },
          { label: "Avg uptime", value: `${avgUptime}%`, icon: BarChart3, accent: "text-foreground" },
        ].map((kpi, i) => (
          <div key={i} className="surface-sunken min-w-0 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="label-caps truncate">{kpi.label}</p>
              <kpi.icon className="block h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />
            </div>
            <p className={`mt-2 text-display-xl leading-none tabular-nums ${kpi.accent}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="mt-6 flex gap-1.5 flex-wrap">
        {[
          { key: "all", label: "All integrations" },
          { key: "issues", label: `Issues (${degradedCount + errorCount})` },
          { key: "accounting", label: "Financial" },
          { key: "commerce", label: "Commerce" },
          { key: "compliance", label: "Compliance" },
          { key: "logistics", label: "Logistics" },
          { key: "quality", label: "Quality" },
          { key: "hr", label: "Workforce" },
          { key: "communication", label: "Notifications" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`px-3 py-1 rounded-lg text-body-sm font-medium transition-colors ${
              filterTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Integration cards */}
      <div className="mt-6 space-y-3">
        {filtered.map(int => (
          <IntegrationCard
            key={int.id}
            int={int}
            isExpanded={expandedId === int.id}
            onToggle={() => setExpandedId(expandedId === int.id ? null : int.id)}
          />
        ))}
      </div>
    </div>
  );
}
