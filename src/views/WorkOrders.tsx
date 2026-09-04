import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { asBuiltRecords, assemblyStations, approvedSupplierLots, supplierLots } from "@/data/traceability";

const tabsConfig = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "released", label: "Released" },
  { key: "inprogress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "onhold", label: "On Hold" },
  { key: "overdue", label: "Overdue" },
];

const PRODUCTS = [
  "Industrial Cleaner 5L", "Floor Polish 1L", "Dish Wash Liquid 500ml",
  "Hand Wash 250ml", "Glass Cleaner 1L", "Toilet Cleaner 500ml",
  "Surface Disinfectant 5L", "Multi-Surface Cleaner 1L", "Fabric Softener 1L",
  "Bathroom Cleaner 500ml", "Kitchen Degreaser 1L", "Phenyl White 5L"
];

const SUPERVISORS = ["Suresh P.", "Anita D.", "Mohan K.", "Ramesh T."];

const generateMockWOs = () => {
  const result: any[] = [];
  let woCounter = 847;
  let seed = 42;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const addItems = (count: number, status: string, material: string) => {
    for (let i = 0; i < count; i++) {
      woCounter++;
      const product = PRODUCTS[Math.floor(random() * PRODUCTS.length)];
      const ordered = (Math.floor(random() * 10) + 1) * 1000;
      let produced = 0;
      if (status === "Completed") produced = ordered;
      else if (["In Progress", "On Hold", "Overdue", "At Risk"].includes(status)) produced = Math.floor(random() * ordered);
      const bom = `v${Math.floor(random() * 4) + 1}.${Math.floor(random() * 5)}`;
      const line = `Line ${Math.floor(random() * 4) + 1}`;
      const supervisor = SUPERVISORS[Math.floor(random() * SUPERVISORS.length)];
      const dateObj = new Date(2026, 2, 25 - Math.floor(random() * 30));
      const dueObj = new Date(dateObj.getTime() + (Math.floor(random() * 5) + 1) * 86400000);
      const scheduled = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const due = dueObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

      // Trace completeness — random but realistic
      const traceComplete = status === "Completed" ? Math.floor(85 + random() * 15) : status === "In Progress" ? Math.floor(40 + random() * 50) : 0;

      result.push({ wo: `WO-2026-${String(woCounter).padStart(4, '0')}`, product, ordered, produced, bom, scheduled, due, line, supervisor, material, status, traceComplete, _timestamp: dateObj.getTime() });
    }
  };

  addItems(18, "Draft", "gray");
  addItems(67, "Released", "blue");
  addItems(41, "In Progress", "amber");
  addItems(90, "Completed", "green");
  addItems(12, "On Hold", "gray");
  addItems(4, "Overdue", "red");
  addItems(2, "At Risk", "red");

  return result.sort((a: any, b: any) => b._timestamp - a._timestamp).map(({ _timestamp, ...rest }: any) => rest);
};

const workOrders = generateMockWOs();

const statusColorMap: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  "Released": "blue", "In Progress": "amber", "Completed": "green",
  "At Risk": "red", "On Hold": "gray", "Overdue": "red", "Draft": "gray",
};

export default function WorkOrders() {
  const [activeTab, setActiveTab] = useState("all");
  const [detailWO, setDetailWO] = useState<string | null>(null);
  const [scanStation, setScanStation] = useState(0);
  const [scanInput, setScanInput] = useState("");
  const [scanResults, setScanResults] = useState<{ station: string; lot: string; valid: boolean; reason: string }[]>([]);

  const filterMap: Record<string, string[]> = {
    draft: ["Draft"], released: ["Released"], inprogress: ["In Progress"],
    completed: ["Completed"], onhold: ["On Hold"], overdue: ["Overdue", "At Risk"],
  };

  const filtered = activeTab === "all" ? workOrders : workOrders.filter((wo: any) => filterMap[activeTab]?.includes(wo.status));
  const getCount = (key: string) => key === "all" ? workOrders.length : workOrders.filter((wo: any) => filterMap[key]?.includes(wo.status)).length;

  // Find as-built record for selected WO
  const asBuilt = detailWO ? asBuiltRecords.find(r => r.workOrderId === detailWO) : null;

  const handleScan = () => {
    if (!scanInput.trim()) return;
    const station = assemblyStations[scanStation];
    const lotInfo = supplierLots.find(l => l.internalLotNumber === scanInput.trim());
    let valid = true;
    let reason = "Lot verified — approved supplier, passed inspection";

    if (!lotInfo) {
      valid = false;
      reason = "Lot not found in system";
    } else if (lotInfo.quarantine) {
      valid = false;
      reason = "BLOCKED: Lot is under quarantine";
    } else if (lotInfo.inspectionStatus === "failed") {
      valid = false;
      reason = "BLOCKED: Lot failed incoming inspection";
    } else if (!approvedSupplierLots.includes(scanInput.trim())) {
      valid = false;
      reason = "BLOCKED: Supplier not on Approved Supplier List";
    }

    if (!valid && station.ctq) {
      reason += " — CTQ HARD BLOCK: Cannot skip this station";
    }

    setScanResults(prev => [...prev, { station: station.name, lot: scanInput.trim(), valid, reason }]);
    if (valid) setScanStation(prev => Math.min(prev + 1, assemblyStations.length - 1));
    setScanInput("");
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Work Orders</h2>

      <div className="flex gap-1 border-b border-border overflow-x-auto animate-fade-in-up stagger-1">
        {tabsConfig.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{t.label} ({getCount(t.key)})</button>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-secondary/50 border-b border-border">
              {["Work Order", "Product", "Ordered", "Produced", "BOM", "Scheduled", "Due", "Line", "Trace %", "Status"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.slice(0, 30).map((wo: any, i: number) => (
                <tr key={i} className={`border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer ${detailWO === wo.wo ? "bg-accent/5" : ""}`} onClick={() => setDetailWO(wo.wo)}>
                  <td className="px-3 py-2 font-mono text-xs text-accent">{wo.wo}</td>
                  <td className="px-3 py-2 font-medium">{wo.product}</td>
                  <td className="px-3 py-2 tabular-nums">{wo.ordered.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{wo.produced.toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{wo.bom}</td>
                  <td className="px-3 py-2">{wo.scheduled}</td>
                  <td className="px-3 py-2">{wo.due}</td>
                  <td className="px-3 py-2">{wo.line}</td>
                  <td className="px-3 py-2">
                    {wo.traceComplete > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${wo.traceComplete >= 95 ? "bg-success" : wo.traceComplete >= 80 ? "bg-warning" : "bg-danger"}`} style={{ width: `${wo.traceComplete}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{wo.traceComplete}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={statusColorMap[wo.status]} label={wo.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* As-Built Genealogy Panel */}
      {asBuilt && (
        <div className="bg-card rounded-lg border-2 border-mbom/30 p-4 animate-fade-in space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-mbom" /> As-Built Genealogy — {asBuilt.unitSerial}
          </h3>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground block">Work Order</span><span className="font-mono font-medium">{asBuilt.workOrderId}</span></div>
            <div><span className="text-muted-foreground block">Assembly Date</span><span className="font-medium">{asBuilt.assemblyDate}</span></div>
            <div><span className="text-muted-foreground block">Operator</span><span className="font-medium">{asBuilt.operatorId}</span></div>
            <div><span className="text-muted-foreground block">QC Result</span>
              <StatusBadge status={asBuilt.qcResult === "pass" ? "green" : asBuilt.qcResult === "fail" ? "red" : "amber"} label={asBuilt.qcResult.toUpperCase()} />
            </div>
          </div>

          {/* Lots consumed tree */}
          <div>
            <span className="text-xs text-muted-foreground font-medium">Lots Consumed per Station</span>
            <div className="mt-1 space-y-1">
              {asBuilt.lotsConsumed.map((lc, i) => {
                const lotInfo = supplierLots.find(l => l.internalLotNumber === lc.lotNumber);
                const isIssue = lotInfo?.quarantine || lotInfo?.inspectionStatus === "failed";
                return (
                  <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${isIssue ? "bg-danger/10 border border-danger/20" : "bg-secondary/50"}`}>
                    <span className="font-mono text-muted-foreground">{lc.station}</span>
                    <span className="font-mono text-accent">{lc.partNumber}</span>
                    <span className="font-mono">{lc.lotNumber}</span>
                    {isIssue && <span className="text-danger font-semibold ml-auto">⚠ SUSPECT</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trace completeness bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Trace Completeness</span>
              <span className="font-bold tabular-nums">{asBuilt.lotsConsumed.length}/{asBuilt.lotsConsumed.length + 1} stations</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-mbom rounded-full" style={{ width: `${(asBuilt.lotsConsumed.length / (asBuilt.lotsConsumed.length + 1)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Lot Scan Simulator */}
      {detailWO && (
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in space-y-3">
          <h3 className="text-sm font-semibold">Lot Scan Simulator</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {assemblyStations.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${i < scanStation ? "bg-success/10 text-success" : i === scanStation ? "bg-accent/10 text-accent border border-accent/30" : "bg-secondary text-muted-foreground"}`}>
                {s.ctq && <span className="text-danger font-bold">★</span>}
                {s.name}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleScan()}
              placeholder={`Scan lot at ${assemblyStations[scanStation]?.name}...`}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
            <button onClick={handleScan} className="h-9 px-4 bg-accent text-accent-foreground rounded-md text-xs font-medium hover:opacity-90">Scan</button>
          </div>
          <div className="text-[10px] text-muted-foreground">Try: LOT-2026-0178 (valid) · LOT-2026-0189 (quarantine) · LOT-2026-0204 (non-ASL)</div>
          {scanResults.length > 0 && (
            <div className="space-y-1">
              {scanResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${r.valid ? "bg-success/10 border border-success/20" : "bg-danger/10 border border-danger/20"}`}>
                  <span className={r.valid ? "text-success font-bold" : "text-danger font-bold"}>{r.valid ? "✓" : "✗"}</span>
                  <span className="font-medium">{r.station}</span>
                  <span className="font-mono">{r.lot}</span>
                  <span className="text-muted-foreground ml-auto">{r.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
