import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { supplierLots, supplierQualityMonthly, heatmapMonths, topPartsByCOPQ } from "@/data/traceability";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

const vendors = [
  { name: "Reliance Polymers", value: "₹1.2 Cr", otd: 92, rejection: 1.2, avgLead: 6, priceVar: -1.8, score: 88, trend: "↑", copq: "₹1.8L" },
  { name: "Galaxy Surfactants", value: "₹85L", otd: 88, rejection: 2.1, avgLead: 7, priceVar: 3.2, score: 82, trend: "→", copq: "₹4.2L" },
  { name: "Rashtriya Chemicals", value: "₹72L", otd: 78, rejection: 3.5, avgLead: 14, priceVar: 5.1, score: 68, trend: "↓", copq: "₹2.8L" },
  { name: "Aarti Industries", value: "₹68L", otd: 85, rejection: 1.8, avgLead: 10, priceVar: 2.4, score: 79, trend: "→", copq: "₹1.1L" },
  { name: "Mold-Tek Containers", value: "₹62L", otd: 94, rejection: 0.5, avgLead: 5, priceVar: -0.5, score: 92, trend: "↑", copq: "₹0.6L" },
  { name: "Tronox India", value: "₹58L", otd: 82, rejection: 2.8, avgLead: 6, priceVar: 4.8, score: 74, trend: "↓", copq: "₹2.1L" },
  { name: "Uflex Packaging", value: "₹52L", otd: 91, rejection: 0.8, avgLead: 4, priceVar: 1.2, score: 87, trend: "↑", copq: "₹0.4L" },
  { name: "Deepak Nitrite", value: "₹48L", otd: 86, rejection: 1.5, avgLead: 5, priceVar: 2.1, score: 81, trend: "→", copq: "₹1.3L" },
  { name: "Givaudan India", value: "₹42L", otd: 75, rejection: 0.3, avgLead: 10, priceVar: 6.2, score: 71, trend: "↓", copq: "₹0.3L" },
  { name: "Gujarat Alkalies", value: "₹38L", otd: 90, rejection: 1.0, avgLead: 5, priceVar: 0.8, score: 85, trend: "↑", copq: "₹0.5L" },
  { name: "SRF Limited", value: "₹35L", otd: 87, rejection: 1.4, avgLead: 7, priceVar: 1.5, score: 83, trend: "→", copq: "₹0.9L" },
  { name: "Hindustan Zinc", value: "₹32L", otd: 93, rejection: 0.6, avgLead: 8, priceVar: -2.1, score: 89, trend: "↑", copq: "₹0.2L" },
];

const otdData = vendors.slice(0, 10).map(v => ({ name: v.name.split(" ")[0], otd: v.otd }));

type VendorTab = "scorecard" | "lots" | "quality";

const [selectedVendorDefault] = vendors;

export default function VendorManagement() {
  const [activeTab, setActiveTab] = useState<VendorTab>("scorecard");
  const [selectedVendor, setSelectedVendor] = useState(selectedVendorDefault.name);
  const [scarModal, setScarModal] = useState<{ supplier: string; part: string; lot: string; copq: string } | null>(null);

  const vendorLots = supplierLots.filter(l => l.supplierName === selectedVendor || activeTab === "lots");

  // Quality trend for selected vendor
  const qualityData = supplierQualityMonthly[selectedVendor];
  const qualityChartData = qualityData ? heatmapMonths.map((m, i) => ({ month: m, defectRate: qualityData[i] })) : [];

  const tabs: { key: VendorTab; label: string }[] = [
    { key: "scorecard", label: "Vendor Scorecard" },
    { key: "lots", label: "Lot Register" },
    { key: "quality", label: "Supplier Quality" },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Vendor Management</h2>
        <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)} className="h-8 px-3 rounded-md border border-input bg-card text-xs w-56">
          {vendors.map(v => <option key={v.name}>{v.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border animate-fade-in-up stagger-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === "scorecard" && (
        <>
          <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-1">
            <h3 className="text-sm font-semibold mb-3">On-Time Delivery by Vendor (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={otdData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis type="number" domain={[60, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="otd" fill={CHART_COLORS.primary} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-secondary/50 border-b border-border">
                {["Vendor", "PO Value (6M)", "OTD %", "Rejection %", "Avg Lead (d)", "Price Var %", "Score", "COPQ YTD", "Trend"].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
                )}
              </tr></thead>
              <tbody>
                {vendors.map((v, i) => (
                  <tr key={i} className={`border-b border-border hover:bg-secondary/30 cursor-pointer ${v.name === selectedVendor ? "bg-accent/5" : ""}`} onClick={() => setSelectedVendor(v.name)}>
                    <td className="px-3 py-2 font-medium">{v.name}</td>
                    <td className="px-3 py-2 tabular-nums">{v.value}</td>
                    <td className="px-3 py-2 tabular-nums"><span className={v.otd >= 90 ? "text-success" : v.otd >= 80 ? "text-warning" : "text-danger"}>{v.otd}%</span></td>
                    <td className="px-3 py-2 tabular-nums"><span className={v.rejection <= 1 ? "text-success" : v.rejection <= 2 ? "text-warning" : "text-danger"}>{v.rejection}%</span></td>
                    <td className="px-3 py-2 tabular-nums">{v.avgLead}</td>
                    <td className="px-3 py-2 tabular-nums"><span className={v.priceVar <= 0 ? "text-success" : v.priceVar <= 3 ? "text-warning" : "text-danger"}>{v.priceVar > 0 ? "+" : ""}{v.priceVar}%</span></td>
                    <td className="px-3 py-2"><span className={`font-bold tabular-nums ${v.score >= 85 ? "text-success" : v.score >= 75 ? "text-warning" : "text-danger"}`}>{v.score}</span></td>
                    <td className="px-3 py-2 tabular-nums text-danger font-medium">{v.copq}</td>
                    <td className="px-3 py-2 text-lg">{v.trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "lots" && (
        <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-secondary/50 border-b border-border">
              {["Int. Lot #", "Supplier Lot #", "Heat #", "Supplier", "Part", "GR Date", "Qty", "Inspection", "CoC", "Expiry"].map(h =>
                <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {supplierLots.map((l, i) => (
                <tr key={i} className={`border-b border-border hover:bg-secondary/30 ${l.quarantine ? "bg-danger/5" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs text-accent">{l.internalLotNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.supplierLotNumber}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.heatNumber}</td>
                  <td className="px-3 py-2 font-medium">{l.supplierName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.partNumber}</td>
                  <td className="px-3 py-2">{l.goodsReceiptDate}</td>
                  <td className="px-3 py-2 tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={l.inspectionStatus === "passed" ? "green" : l.inspectionStatus === "failed" ? "red" : "amber"} label={l.inspectionStatus.charAt(0).toUpperCase() + l.inspectionStatus.slice(1)} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.cocReference}</td>
                  <td className="px-3 py-2">{l.expiryDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "quality" && (
        <div className="space-y-4 animate-fade-in">
          {/* Quality Trend Chart */}
          {qualityChartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">Defect Rate Trend — {selectedVendor} (12 Months)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={qualityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => `${v}%`} />
                  <Line type="monotone" dataKey="defectRate" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} name="Defect Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Supplier Quality Heatmap */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Supplier Quality Heatmap — Defect Rate %</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-40">Supplier</th>
                  {heatmapMonths.map(m => <th key={m} className="px-2 py-1.5 font-medium text-muted-foreground text-center w-12">{m}</th>)}
                </tr></thead>
                <tbody>
                  {Object.entries(supplierQualityMonthly).map(([supplier, rates]) => (
                    <tr key={supplier} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium text-xs">{supplier}</td>
                      {rates.map((rate, i) => {
                        const bg = rate < 2 ? "bg-success/20" : rate <= 5 ? "bg-warning/20" : "bg-danger/20";
                        const text = rate < 2 ? "text-success" : rate <= 5 ? "text-warning" : "text-danger";
                        return <td key={i} className={`px-2 py-1.5 text-center tabular-nums font-semibold ${bg} ${text}`}>{rate.toFixed(1)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Parts by COPQ */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-secondary/50 border-b border-border">
                {["Part #", "Part Name", "Supplier", "Defect Rate %", "COPQ YTD", "Action"].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
                )}
              </tr></thead>
              <tbody>
                {topPartsByCOPQ.map((p, i) => (
                  <tr key={i} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs text-accent">{p.partNumber}</td>
                    <td className="px-3 py-2 font-medium">{p.partName}</td>
                    <td className="px-3 py-2">{p.supplier}</td>
                    <td className="px-3 py-2 tabular-nums"><span className={p.defectRate > 5 ? "text-danger font-bold" : p.defectRate > 2 ? "text-warning" : "text-success"}>{p.defectRate}%</span></td>
                    <td className="px-3 py-2 tabular-nums font-medium text-danger">{p.copqYTD}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setScarModal({ supplier: p.supplier, part: p.partNumber, lot: p.lotNumber, copq: p.copqYTD })}
                        className="h-7 px-2.5 bg-danger text-danger-foreground rounded text-xs font-medium hover:opacity-90">Raise SCAR</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SCAR Modal */}
      {scarModal && (
        <div className="fixed inset-0 bg-foreground/30 flex items-center justify-center z-50" onClick={() => setScarModal(null)}>
          <div className="bg-card rounded-lg border border-border p-6 w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4">Raise Supplier Corrective Action Request (SCAR)</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{scarModal.supplier}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Part Number</span><span className="font-mono">{scarModal.part}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lot Number</span><span className="font-mono">{scarModal.lot}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">COPQ Cost</span><span className="font-medium text-danger">{scarModal.copq}</span></div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Corrective Action Description</label>
                <textarea className="w-full h-20 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none" placeholder="Describe required corrective action..." />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setScarModal(null)} className="h-8 px-3 bg-secondary text-foreground rounded-md text-xs font-medium">Cancel</button>
              <button onClick={() => setScarModal(null)} className="h-8 px-3 bg-danger text-danger-foreground rounded-md text-xs font-medium">Submit SCAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
