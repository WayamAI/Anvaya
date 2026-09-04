import { useState } from "react";
import { Zap, Clock, AlertTriangle, CheckCircle, Filter } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

const RAW_MATERIALS = [
  "Polypropylene Granules", "Stearic Acid", "HDPE Resin", "Sodium Lauryl Sulphate",
  "EDTA Disodium Salt", "Titanium Dioxide", "Demineralised Water", "Fragrance Blend FG-04",
  "Caustic Soda Flakes", "Citric Acid Monohydrate", "Isopropyl Alcohol"
];

const PKG_MATERIALS = [
  "HDPE Bottle 5L", "Shrink Labels (Type A)", "Foil Seals 5L", "Corrugated Cartons (5L x6)"
];

const VENDORS = [
  "Reliance Polymers", "Rashtriya Chemicals", "GAIL India", "Galaxy Surfactants",
  "Aarti Industries", "Tronox India", "Aqua Pure Systems", "Givaudan India",
  "Mold-Tek Containers", "Uflex Packaging", "Bilcare Solutions", "Packman Industries"
];

const WAREHOUSES = ["Pune Plant", "Mumbai WH", "Chennai Hub", "Delhi Depot"];

const generatePlannedOrders = () => {
  const result: any[] = [];
  let seed = 123;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  for (let i = 0; i < 312; i++) {
    const isRm = random() > 0.3;
    const material = isRm ? RAW_MATERIALS[Math.floor(random() * RAW_MATERIALS.length)] : PKG_MATERIALS[Math.floor(random() * PKG_MATERIALS.length)];
    const code = `${isRm ? 'RM' : 'PM'}-${1000 + i}`;
    const warehouse = WAREHOUSES[Math.floor(random() * WAREHOUSES.length)];
    const qty = `${(Math.floor(random() * 50) + 1) * 100} ${isRm && material !== "Demineralised Water" && material !== "Fragrance Blend FG-04" && material !== "Isopropyl Alcohol" ? 'kg' : isRm ? 'L' : 'pcs'}`;
    const vendor = VENDORS[Math.floor(random() * VENDORS.length)];
    const lead = Math.floor(random() * 14) + 2;

    const dateObj = new Date(2026, 2, 25 + Math.floor(random() * 5)); 
    const reqObj = new Date(dateObj.getTime() + (lead + Math.floor(random() * 3)) * 86400000);
    
    const orderDate = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");
    const reqDate = reqObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace(/ /g, " ");

    const statusRoll = random();
    const status = statusRoll > 0.85 ? "exception" : statusRoll > 0.6 ? "firmed" : "planned";

    result.push({ code, name: material, warehouse, qty, orderDate, reqDate, vendor, lead, status });
  }
  return result;
};

const plannedOrders = generatePlannedOrders();

const EXCEPTION_TYPES = ["Material Shortage", "Late Delivery Risk", "BOM Missing", "Excess Stock"];
const EXCEPTION_ACTIONS = [
  "Place emergency PO", "Expedite with vendor", "Define BOM structure", "Reduce safety stock", "Switch to alternate vendor"
];
const ASSIGNEES = ["Priya S.", "Vikram T.", "Rajesh K.", "Arun M."];

const generateExceptions = () => {
  const result: any[] = [];
  let seed = 456;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  for (let i = 0; i < 18; i++) {
    const isRm = random() > 0.3;
    const materialName = isRm ? RAW_MATERIALS[Math.floor(random() * RAW_MATERIALS.length)] : PKG_MATERIALS[Math.floor(random() * PKG_MATERIALS.length)];
    const material = `${materialName} (${isRm ? 'RM' : 'PM'}-${2000 + i})`;
    const type = EXCEPTION_TYPES[Math.floor(random() * EXCEPTION_TYPES.length)];
    const severity = type === "Excess Stock" ? "low" : type === "BOM Missing" ? "medium" : "high";
    const action = EXCEPTION_ACTIONS[Math.floor(random() * EXCEPTION_ACTIONS.length)];
    const assigned = ASSIGNEES[Math.floor(random() * ASSIGNEES.length)];

    result.push({ type, material, severity, action, assigned });
  }
  return result;
};

const exceptions = generateExceptions();

export default function MRPRun() {
  const [tab, setTab] = useState<"planned" | "exceptions" | "pegging">("planned");
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => setRunning(false), 3000);
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div><span className="text-muted-foreground">Last run:</span> <span className="font-medium">23 Mar 2026, 06:30 AM</span></div>
            <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">Full regenerative</span></div>
            <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">4m 12s</span></div>
            <div><span className="text-muted-foreground">Planned orders:</span> <span className="font-semibold">312</span></div>
            <div><span className="text-muted-foreground">Exceptions:</span> <span className="font-semibold text-danger">18</span></div>
          </div>
          <div className="flex items-center gap-3">
            <select className="h-9 px-3 rounded-lg border border-input bg-background text-sm">
              <option>Full regenerative</option>
              <option>Net change</option>
            </select>
            <button
              onClick={handleRun}
              disabled={running}
              className="h-9 px-4 bg-accent text-accent-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-60"
            >
              <Zap className="w-3.5 h-3.5" /> {running ? "Running..." : "Run MRP Now"}
            </button>
          </div>
        </div>
        {running && (
          <div className="mt-3">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "65%", transition: "width 3s ease" }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Processing material requirements... 65% complete</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["planned", `Planned Orders (${plannedOrders.length})`], ["exceptions", `Exceptions (${exceptions.length})`], ["pegging", "Pegging View"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {tab === "planned" && (
        <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">
                    <input type="checkbox" className="rounded" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Material</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Warehouse</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Req. Qty</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Order Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Req. Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Vendor</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Lead (d)</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {plannedOrders.slice(0, 50).map((o, i) => (
                  <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2"><input type="checkbox" className="rounded" /></td>
                    <td className="px-3 py-2 font-mono text-xs">{o.code}</td>
                    <td className="px-3 py-2 font-medium">{o.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.warehouse}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.qty}</td>
                    <td className="px-3 py-2">{o.orderDate}</td>
                    <td className="px-3 py-2">{o.reqDate}</td>
                    <td className="px-3 py-2">{o.vendor}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.lead}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge
                        status={o.status === "firmed" ? "green" : o.status === "exception" ? "red" : "blue"}
                        label={o.status === "firmed" ? "Firmed" : o.status === "exception" ? "Exception" : "Planned"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">

            <span className="text-xs text-muted-foreground">Showing {Math.min(50, plannedOrders.length)} of {plannedOrders.length} planned orders</span>
          </div>
        </div>
      )}

      {tab === "exceptions" && (
        <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Material</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Severity</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Recommended Action</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((e, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2">{e.type}</td>
                  <td className="px-3 py-2 font-medium">{e.material}</td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={e.severity === "high" ? "red" : e.severity === "medium" ? "amber" : "green"} label={e.severity} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.action}</td>
                  <td className="px-3 py-2">{e.assigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "pegging" && (
        <div className="bg-card rounded-lg border border-border p-6 animate-fade-in">
          <p className="text-sm text-muted-foreground mb-4">Select a material from the Planned Orders tab to view the supply-demand pegging chain.</p>
          <div className="bg-secondary/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-3">Pegging: Stearic Acid (RM-2087)</h4>
            <div className="space-y-2 text-sm font-mono">
              <div className="pl-0">📦 <span className="font-medium">Demand: WO-2026-0847</span> — Industrial Cleaner 5L — 120 kg</div>
              <div className="pl-4">↳ BOM Level 1: Concentrate Base — 48 kg per 1,000 units</div>
              <div className="pl-8">↳ BOM Level 2: Stearic Acid — 0.12 kg per L</div>
              <div className="pl-0 mt-2">📦 <span className="font-medium">Demand: WO-2026-0853</span> — Hand Wash 250ml — 80 kg</div>
              <div className="pl-4">↳ BOM Level 1: Emulsifier Blend — 32 kg per 5,000 units</div>
              <div className="pl-0 mt-2">📦 <span className="font-medium">Demand: SO-4521</span> — Sales Order (Reliance Retail) — 300 kg</div>
              <div className="pl-0 mt-3 border-t border-border pt-3">🔄 <span className="font-medium">Supply:</span></div>
              <div className="pl-4">📍 On-hand stock: 180 kg (Pune Plant)</div>
              <div className="pl-4">🚚 PO-2026-0412 — 500 kg — ETA: 10 Apr 2026 (Rashtriya Chemicals)</div>
              <div className="pl-4 text-danger">⚠️ Shortfall: 320 kg before PO arrives</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
