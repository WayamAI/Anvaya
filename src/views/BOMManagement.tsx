import { useState } from "react";
import { ChevronRight, ChevronDown, Package, Download, Shield, Search } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { ebomParts } from "@/data/traceability";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";

interface BOMNode {
  code: string;
  name: string;
  qty: string;
  uom: string;
  lead: number;
  children?: BOMNode[];
}

const bomTree: BOMNode = {
  code: "FG-001", name: "Industrial Cleaning Compound 5L", qty: "1", uom: "unit", lead: 0,
  children: [
    {
      code: "SA-101", name: "Concentrate Base", qty: "2.5", uom: "L", lead: 1,
      children: [
        { code: "RM-4023", name: "Sodium Lauryl Sulphate", qty: "0.8", uom: "kg", lead: 7 },
        { code: "RM-5018", name: "EDTA Disodium Salt", qty: "0.12", uom: "kg", lead: 10 },
        { code: "RM-7044", name: "Demineralised Water", qty: "1.8", uom: "L", lead: 2 },
        { code: "RM-2087", name: "Stearic Acid", qty: "0.15", uom: "kg", lead: 14 },
      ],
    },
    { code: "RM-8012", name: "Fragrance Blend FG-04", qty: "0.05", uom: "L", lead: 10 },
    { code: "PM-1001", name: "HDPE Bottle 5L", qty: "1", uom: "pc", lead: 5 },
    { code: "PM-2003", name: "Foil Seal", qty: "1", uom: "pc", lead: 5 },
    { code: "PM-1002", name: "Shrink Label", qty: "1", uom: "pc", lead: 4 },
  ],
};

const products = [
  "Industrial Cleaning Compound 5L", "Floor Polish 1L", "Dish Wash Liquid 500ml",
  "Hand Wash 250ml", "Glass Cleaner 1L", "Toilet Cleaner 500ml",
  "Surface Disinfectant 5L", "Anti-Bacterial Compound V2",
];

function TreeNode({ node, depth = 0, onSelect }: { node: BOMNode; depth?: number; onSelect: (code: string) => void }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/50 rounded-md cursor-pointer transition-colors text-sm"
        style={{ paddingLeft: depth * 20 + 8 }}
        onClick={() => { hasChildren ? setOpen(!open) : onSelect(node.code); }}
      >
        {hasChildren ? (
          open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
        <span className="font-medium">{node.name}</span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{node.qty} {node.uom}</span>
        {node.lead > 0 && <span className="text-xs text-muted-foreground">{node.lead}d</span>}
      </div>
      {hasChildren && open && node.children!.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

const itemDetails: Record<string, { stock: string; openPO: string; vendor: string; altVendor: string; cost: string; lastPrice: string }> = {
  "RM-4023": { stock: "1,450 kg", openPO: "800 kg (ETA 2 Apr)", vendor: "Galaxy Surfactants", altVendor: "BASF India", cost: "₹185/kg", lastPrice: "₹182/kg" },
  "RM-5018": { stock: "95 kg", openPO: "None", vendor: "Aarti Industries", altVendor: "Loba Chemie", cost: "₹420/kg", lastPrice: "₹410/kg" },
  "RM-2087": { stock: "180 kg", openPO: "500 kg (ETA 10 Apr)", vendor: "Rashtriya Chemicals", altVendor: "Godrej Industries", cost: "₹145/kg", lastPrice: "₹138/kg" },
  "PM-1001": { stock: "8,200 pcs", openPO: "10,000 pcs (ETA 4 Apr)", vendor: "Mold-Tek Containers", altVendor: "Time Technoplast", cost: "₹42/pc", lastPrice: "₹40/pc" },
};

const traceabilityLevelColors: Record<string, { bg: string; text: string }> = {
  serial: { bg: "bg-ebom/10", text: "text-ebom" },
  lot: { bg: "bg-mbom/10", text: "text-mbom" },
  batch: { bg: "bg-sbom/10", text: "text-sbom" },
  none: { bg: "bg-muted", text: "text-muted-foreground" },
};

// Where-used mock
const whereUsed: Record<string, string[]> = {
  "RM-4023": ["Industrial Cleaning Compound 5L", "Surface Disinfectant 5L", "Floor Polish 1L", "Anti-Bacterial Compound V2"],
  "RM-2087": ["Industrial Cleaning Compound 5L", "Hand Wash 250ml", "Dish Wash Liquid 500ml"],
  "PM-1001": ["Industrial Cleaning Compound 5L", "Surface Disinfectant 5L"],
  "RM-5018": ["Industrial Cleaning Compound 5L", "Glass Cleaner 1L"],
  "RM-8012": ["Industrial Cleaning Compound 5L", "Toilet Cleaner 500ml", "Bathroom Cleaner"],
};

export default function BOMManagement() {
  const [selected, setSelected] = useState("Industrial Cleaning Compound 5L");
  const [selectedItem, setSelectedItem] = useState<string | null>("RM-4023");
  const [showWhereUsed, setShowWhereUsed] = useState(false);

  const ebomPart = ebomParts.find(p => p.partNumber === selectedItem);
  const failureData = ebomPart?.fieldFailureRate.map((v, i) => ({
    month: ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"][i],
    rate: v,
  }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">BOM Management</h2>
        <div className="flex gap-2">
          <button className="h-8 px-3 bg-card border border-border rounded-md text-xs font-medium hover:bg-secondary transition-colors flex items-center gap-1">
            <Download className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-1">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-9 px-3 rounded-lg border border-input bg-card text-sm w-80">
          {products.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-4 animate-fade-in-up stagger-2">
        {/* BOM Tree */}
        <div className="col-span-3 bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-3">Bill of Materials — {selected}</h3>
          <TreeNode node={bomTree} onSelect={setSelectedItem} />
        </div>

        {/* Detail Panel */}
        <div className="col-span-2 bg-card rounded-lg border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold">Component Details</h3>
          {selectedItem && itemDetails[selectedItem] ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Current Stock</span><span className="font-medium">{itemDetails[selectedItem].stock}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Open POs</span><span className="font-medium">{itemDetails[selectedItem].openPO}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Primary Vendor</span><span className="font-medium">{itemDetails[selectedItem].vendor}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Alternate Vendor</span><span className="font-medium">{itemDetails[selectedItem].altVendor}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Standard Cost</span><span className="font-medium">{itemDetails[selectedItem].cost}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Purchase Price</span><span className="font-medium">{itemDetails[selectedItem].lastPrice}</span></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click a component in the BOM tree to view details.</p>
          )}

          {/* EBOM Traceability Panel */}
          {ebomPart && (
            <div className="border-t border-border pt-4 space-y-3">
              <h4 className="text-xs font-semibold text-ebom uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> EBOM Traceability
              </h4>

              {/* Revision History Timeline */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">Revision History</span>
                <div className="space-y-1">
                  {ebomPart.revisionHistory.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.rev === ebomPart.currentRevision ? "bg-ebom/10 border border-ebom/20" : "bg-secondary/50"}`}>
                      <span className={`font-bold ${r.rev === ebomPart.currentRevision ? "text-ebom" : "text-muted-foreground"}`}>Rev {r.rev}</span>
                      <span className="text-muted-foreground">{r.date}</span>
                      <span className="font-mono text-muted-foreground">{r.eco}</span>
                      <span className="flex-1 truncate">{r.summary}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ECO & Effectivity */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">ECO</span><span className="font-mono font-medium">{ebomPart.ecoNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Rev</span><span className="font-bold text-ebom">{ebomPart.currentRevision}</span></div>
              </div>

              {/* Effectivity bar */}
              <div>
                <span className="text-xs text-muted-foreground">Effectivity Range</span>
                <div className="mt-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-ebom/40 rounded-full" style={{ width: "70%" }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>{ebomPart.effectivityStart}</span>
                  <span>{ebomPart.effectivityEnd}</span>
                </div>
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${traceabilityLevelColors[ebomPart.traceabilityLevel].bg} ${traceabilityLevelColors[ebomPart.traceabilityLevel].text}`}>
                  {ebomPart.traceabilityLevel.toUpperCase()}
                </span>
                {ebomPart.ctq && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-danger/10 text-danger">
                    CTQ
                  </span>
                )}
              </div>

              {/* Where-used button */}
              <button onClick={() => setShowWhereUsed(!showWhereUsed)} className="text-xs text-accent hover:underline flex items-center gap-1">
                <Search className="w-3 h-3" /> Where-used analysis →
              </button>
              {showWhereUsed && selectedItem && whereUsed[selectedItem] && (
                <div className="bg-secondary/50 rounded-md p-2 space-y-1">
                  {whereUsed[selectedItem].map((a, i) => (
                    <div key={i} className="text-xs text-foreground">• {a}</div>
                  ))}
                </div>
              )}

              {/* Field Failure Rate sparkline */}
              {failureData && (
                <div>
                  <span className="text-xs text-muted-foreground">Field Failure Rate (12mo)</span>
                  <ResponsiveContainer width="100%" height={60}>
                    <LineChart data={failureData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: number) => `${v}%`} />
                      <Line type="monotone" dataKey="rate" stroke={CHART_COLORS.primary} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
