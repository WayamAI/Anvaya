import { useState } from "react";
import { ChevronRight, ChevronDown, Package, Download, Shield, Search } from "lucide-react";
import { ebomParts } from "@/data/traceability";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { btnLink, btnSecondary, selectBase } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { cn } from "@/lib/utils";

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

/** Flattened once so the detail panel can name the part the tree has selected. */
const nodeIndex: Record<string, BOMNode> = {};
(function index(node: BOMNode) {
  nodeIndex[node.code] = node;
  node.children?.forEach(index);
})(bomTree);

/*
  One row of the tree.

  Quantity and lead time sit in fixed-width cells pinned to the right rather
  than flowing after the name, so they line up in a column no matter how deep
  a row is indented — which is the whole reason to put them in a tree rather
  than a list.

  Children nest inside a bordered container instead of taking a computed
  padding-left. The border is the indent guide: at four levels deep it is the
  only thing that tells you which parent a row belongs to.
*/
function TreeNode({
  node,
  selected,
  onSelect,
}: {
  node: BOMNode;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.code === selected;

  return (
    <div>
      <div
        className={cn(
          "group relative flex items-center gap-2 rounded-lg py-1.5 pl-2 pr-2.5 cursor-pointer",
          "text-body-md transition-colors",
          // Selected is a step darker than hover, plus a marker on the leading
          // edge. A fill alone at this weight is easy to mistake for hover.
          isSelected
            ? "bg-secondary font-medium text-foreground"
            : "hover:bg-sunken",
        )}
        onClick={() => {
          // Unchanged behaviour: a parent folds, a leaf selects.
          if (hasChildren) setOpen(!open);
          else onSelect(node.code);
        }}
      >
        {isSelected && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-foreground"
          />
        )}
        {hasChildren ? (
          open ? <ChevronDown className="w-3.5 h-3.5 text-ink-quaternary flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-ink-quaternary flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <Package className="w-3.5 h-3.5 text-ink-quaternary flex-shrink-0" />
        <span className="identifier text-body-sm text-muted-foreground w-[74px] flex-shrink-0">{node.code}</span>
        <span className="truncate">{node.name}</span>
        <span className="ml-auto w-[88px] flex-shrink-0 text-right text-body-sm tabular-nums text-muted-foreground">
          {node.qty} {node.uom}
        </span>
        <span className="w-[52px] flex-shrink-0 text-right text-body-sm tabular-nums text-muted-foreground">
          {node.lead > 0 ? `${node.lead}d` : "—"}
        </span>
      </div>
      {hasChildren && open && (
        <div className="mt-0.5 ml-[15px] space-y-0.5 border-l border-border pl-2.5">
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
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

/** Label / value pair. One shape for all eighteen of them. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-body-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-body-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

/** A titled group inside the detail panel. */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-caps mb-1">{title}</p>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

export default function BOMManagement() {
  const [selected, setSelected] = useState("Industrial Cleaning Compound 5L");
  const [selectedItem, setSelectedItem] = useState<string | null>("RM-4023");
  const [showWhereUsed, setShowWhereUsed] = useState(false);

  const ebomPart = ebomParts.find(p => p.partNumber === selectedItem);
  const failureData = ebomPart?.fieldFailureRate.map((v, i) => ({
    month: ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"][i],
    rate: v,
  }));
  const latestFailure = ebomPart?.fieldFailureRate[ebomPart.fieldFailureRate.length - 1];
  const details = selectedItem ? itemDetails[selectedItem] : undefined;
  const selectedNode = selectedItem ? nodeIndex[selectedItem] : undefined;

  return (
    <div className="px-6 py-5">
      {/*
        One header band: what you are looking at, which BOM, and the way out.
        The selector used to sit on its own row below the title, which cost a
        whole band of vertical space to hold one control.
      */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-5">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">BOM management</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Product"
            className={cn(selectBase, "w-auto min-w-[260px]")}
          >
            {products.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button className={btnSecondary}>
            <Download /> Export
          </button>
        </div>
      </header>

      {/*
        Seven/five rather than an even split: the tree is the thing being read
        and needs the room for deep rows, while the detail panel is a fixed
        set of short fields. Stacks below xl, where two columns of this density
        stop being readable side by side.
      */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {/* ---- BOM hierarchy ------------------------------------------- */}
        <section className="surface-panel min-w-0 xl:col-span-7">
          <div className="panel-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="label-caps">Bill of materials</p>
              <h2 className="mt-1 truncate text-body-lg font-medium text-foreground">{selected}</h2>
            </div>
            <p className="text-body-sm text-muted-foreground">Select a component to inspect it</p>
          </div>

          {/* Column heads for the two right-hand cells, so the numbers below
              are labelled rather than left to be inferred. */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 pr-[18px]">
            <span className="label-caps flex-1">Component</span>
            <span className="label-caps w-[88px] shrink-0 text-right">Qty</span>
            <span className="label-caps w-[52px] shrink-0 text-right">Lead</span>
          </div>

          <div className="overflow-x-auto p-2">
            <div className="min-w-[520px]">
              <TreeNode node={bomTree} selected={selectedItem} onSelect={setSelectedItem} />
            </div>
          </div>
        </section>

        {/* ---- Component details, traceability, chart ------------------- */}
        <div className="min-w-0 space-y-4 xl:col-span-5">
          {/* Component details */}
          <section className="surface-panel">
            <div className="panel-head">
              <p className="label-caps">Component details</p>
              {selectedNode ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 className="text-body-lg font-medium text-foreground">{selectedNode.name}</h2>
                  <span className="identifier text-body-sm text-muted-foreground">{selectedNode.code}</span>
                </div>
              ) : (
                <h2 className="mt-1 text-body-lg font-medium text-muted-foreground">No component selected</h2>
              )}
            </div>

            {details ? (
              <div className="space-y-4 p-4">
                <FieldGroup title="Inventory">
                  <Field label="Current stock" value={details.stock} />
                  <Field label="Open POs" value={details.openPO} />
                </FieldGroup>
                <FieldGroup title="Suppliers">
                  <Field label="Primary vendor" value={details.vendor} />
                  <Field label="Alternate vendor" value={details.altVendor} />
                </FieldGroup>
                <FieldGroup title="Cost">
                  <Field label="Standard cost" value={details.cost} />
                  <Field label="Last purchase price" value={details.lastPrice} />
                </FieldGroup>
              </div>
            ) : (
              <p className="p-4 text-body-sm text-muted-foreground">
                Click a component in the BOM tree to view details.
              </p>
            )}
          </section>

          {/* EBOM traceability */}
          {ebomPart && (
            <section className="surface-panel">
              <div className="panel-head flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="label-caps flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-ebom" /> EBOM traceability
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium ${traceabilityLevelColors[ebomPart.traceabilityLevel].bg} ${traceabilityLevelColors[ebomPart.traceabilityLevel].text}`}>
                    {ebomPart.traceabilityLevel.toUpperCase()}
                  </span>
                  {ebomPart.ctq && (
                    <span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-0.5 text-caption font-medium text-danger">
                      CTQ
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-4">
                {/* Current state, read before the history that produced it. */}
                <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="sm:pr-4">
                    <Field label="Current rev" value={ebomPart.currentRevision} />
                  </div>
                  <div className="sm:pl-4">
                    <Field label="ECO" value={ebomPart.ecoNumber} />
                  </div>
                </div>

                {/* Revision history — a real table, so rev, date, ECO and the
                    change each own a column and scan vertically. */}
                <div>
                  <p className="label-caps mb-1.5">Revision history</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="label-caps whitespace-nowrap py-1.5 pr-3">Rev</th>
                          <th className="label-caps whitespace-nowrap py-1.5 pr-3">Date</th>
                          <th className="label-caps whitespace-nowrap py-1.5 pr-3">ECO</th>
                          <th className="label-caps py-1.5">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ebomPart.revisionHistory.map((r, i) => {
                          const isCurrent = r.rev === ebomPart.currentRevision;
                          return (
                            <tr
                              key={i}
                              className={cn(
                                "border-b border-border last:border-b-0",
                                isCurrent && "bg-sunken",
                              )}
                            >
                              <td className="whitespace-nowrap py-1.5 pr-3 text-body-sm">
                                <span className={cn("font-medium", isCurrent ? "text-ebom" : "text-muted-foreground")}>
                                  {r.rev}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-1.5 pr-3 text-body-sm tabular-nums text-muted-foreground">{r.date}</td>
                              <td className="identifier whitespace-nowrap py-1.5 pr-3 text-body-sm text-muted-foreground">{r.eco}</td>
                              <td className="py-1.5 text-body-sm text-ink-secondary">{r.summary}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Effectivity */}
                <div>
                  <p className="label-caps mb-1.5">Effectivity range</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-ebom/40" style={{ width: "70%" }} />
                  </div>
                  <div className="mt-1 flex justify-between text-body-sm tabular-nums text-muted-foreground">
                    <span>{ebomPart.effectivityStart}</span>
                    <span>{ebomPart.effectivityEnd}</span>
                  </div>
                </div>

                {/* Where-used */}
                <div className="border-t border-border pt-3">
                  <button onClick={() => setShowWhereUsed(!showWhereUsed)} className={`${btnLink} flex items-center gap-1`}>
                    <Search className="h-3 w-3" /> Where-used analysis →
                  </button>
                  {showWhereUsed && selectedItem && whereUsed[selectedItem] && (
                    <ul className="mt-2 space-y-1 rounded-lg bg-sunken p-3">
                      {whereUsed[selectedItem].map((a, i) => (
                        <li key={i} className="text-body-sm text-ink-secondary">• {a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Field failure rate — its own card, with the figure stated rather
              than left to be read off an unlabelled sparkline. */}
          {ebomPart && failureData && (
            <section className="surface-panel">
              <div className="panel-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="label-caps">Field failure rate</p>
                <span className="text-body-sm text-muted-foreground">Last 12 months</span>
              </div>
              <div className="p-4">
                <p className="font-display text-display-lg tabular-nums text-foreground">{latestFailure}%</p>
                <p className="mt-0.5 text-body-sm text-muted-foreground">Current month</p>
                <ResponsiveContainer width="100%" height={96} className="mt-3">
                  <LineChart data={failureData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} domain={[0, "auto"]} width={34} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="rate" stroke={CHART_COLORS.primary} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
