import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Package, Download, Shield, Search } from "lucide-react";
import { btnLink, btnSecondary, selectBase } from "@/components/app/controls";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { flattenTree, type BomNode, type BomProduct, type BomView, type ComponentDetail } from "@/server/production/bom";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
/** Recipe quantities are small by nature (0.048 kg per L); two decimals would misstate them. */
const recipeQty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });

/** A node's path through the tree — unique even when a material appears twice. */
const nodeKey = (path: number[]) => path.join(".");

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
  path,
  selected,
  onSelect,
}: {
  node: BomNode;
  path: number[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const key = nodeKey(path);
  const isSelected = key === selected;

  const qtyTitle = node.level === 0
    ? "One unit of the product"
    : `${recipeQty(node.qtyPerParent)} ${node.uom} per unit of parent` +
      (node.scrapFactor > 0 ? ` · ${recipeQty(node.grossPerParent)} with ${pct(node.scrapFactor)} scrap` : " · no scrap") +
      ` · ${recipeQty(node.qtyPerTop)} per unit of the product`;

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
          else onSelect(key);
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
        {node.cycle && <span className="text-caption text-danger">cycle</span>}
        <span className="ml-auto w-[88px] flex-shrink-0 text-right text-body-sm tabular-nums text-muted-foreground" title={qtyTitle}>
          {recipeQty(node.qtyPerParent)} {node.uom}
        </span>
        <span
          className="w-[52px] flex-shrink-0 text-right text-body-sm tabular-nums text-muted-foreground"
          title={node.leadTimeDays === null ? "No lead time on record" : node.leadTimeSource === "PRODUCTION" ? "Production lead time" : "Vendor lead time"}
        >
          {node.leadTimeDays === null ? "—" : `${node.leadTimeDays}d`}
        </span>
      </div>
      {hasChildren && open && (
        <div className="mt-0.5 ml-[15px] space-y-0.5 border-l border-border pl-2.5">
          {node.children.map((child, i) => (
            <TreeNode key={i} node={child} path={[...path, i]} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Label / value pair. One shape for all of them. */
function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-body-sm text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-body-sm font-medium text-right", muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
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

function PanelLoading() {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
    </div>
  );
}

/** Walk a path of child indexes back to its node. */
function nodeAt(root: BomNode, key: string): BomNode | null {
  let node: BomNode | undefined = root;
  for (const i of key.split(".").slice(1)) node = node?.children[Number(i)];
  return node ?? null;
}

function firstLeaf(node: BomNode, path: number[] = [0]): string {
  return node.children.length ? firstLeaf(node.children[0], [...path, 0]) : nodeKey(path);
}

function exportCsv(view: BomView) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Level", "Code", "Material", "Kind", "Qty per parent", "UOM", "Scrap %", "Gross per parent",
    "Qty per product unit", "Lead time (d)", "Lead time source", "Standard cost", "Materials cost per unit", "Extended cost per parent",
  ];
  const rows = flattenTree(view.tree).map((n) => [
    n.level, n.code, n.name, n.kind, n.qtyPerParent, n.uom, Math.round(n.scrapFactor * 10000) / 100, n.grossPerParent,
    n.qtyPerTop, n.leadTimeDays, n.leadTimeSource, n.standardCost, n.materialCost, n.level === 0 ? null : n.extendedCost,
  ]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${view.bom.code}-rev-${view.version.version}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BOMManagement() {
  const [productId, setProductId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showWhereUsed, setShowWhereUsed] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["boms"],
    queryFn: ({ signal }) => apiGet<BomProduct[]>("/boms", undefined, { signal }),
  });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  // Open on the first product that has a BOM.
  useEffect(() => {
    if (!productId && products.length) setProductId((products.find((p) => p.bom) ?? products[0]).materialId);
  }, [products, productId]);

  const product = products.find((p) => p.materialId === productId) ?? null;
  const bomId = product?.bom?.id ?? null;

  const bomQuery = useQuery({
    queryKey: ["bom", bomId],
    queryFn: ({ signal }) => apiGet<BomView>(`/boms/${bomId}`, undefined, { signal }),
    enabled: !!bomId,
  });
  const view = bomQuery.data;

  // Keep a component selected: the first leaf whenever the tree changes.
  useEffect(() => {
    setSelectedKey(view ? firstLeaf(view.tree) : null);
    setShowWhereUsed(false);
  }, [view]);

  const selectedNode = view && selectedKey ? nodeAt(view.tree, selectedKey) : null;

  const detailQuery = useQuery({
    queryKey: ["bom-component", selectedNode?.materialId],
    queryFn: ({ signal }) => apiGet<ComponentDetail>(`/boms/components/${selectedNode!.materialId}`, undefined, { signal }),
    enabled: !!selectedNode,
  });
  const detail = detailQuery.data;

  const openPos = detail?.purchasing?.openLines ?? [];
  const openPoText = !detail ? "—"
    : detail.purchasing === null ? "Not permitted"
      : openPos.length === 0 ? "None"
        : `${formatQty(openPos.reduce((s, l) => s + l.outstandingQty, 0))} ${detail.material.uom} · ${openPos.map((l) => `${l.purchaseOrderNumber} (due ${fmtDate(l.expectedDate)})`).join(", ")}`;

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
            value={productId ?? ""}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Product"
            disabled={!products.length}
            className={cn(selectBase, "w-auto min-w-[260px]")}
          >
            {!products.length && <option value="">{productsQuery.isPending ? "Loading products…" : "No products"}</option>}
            {products.map((p) => (
              <option key={p.materialId} value={p.materialId}>{p.name}{p.bom ? "" : " (no BOM)"}</option>
            ))}
          </select>
          <button className={btnSecondary} disabled={!view} onClick={() => view && exportCsv(view)}
            title={view ? `Download ${view.bom.code} rev ${view.version.version} as CSV` : "No BOM to export"}>
            <Download /> Export
          </button>
        </div>
      </header>

      {productsQuery.error ? (
        <div className="surface-panel">
          <EmptyState title="Products could not be loaded" description={productsQuery.error.message}
            action={<button className={btnSecondary} onClick={() => void productsQuery.refetch()}>Try again</button>} />
        </div>
      ) : (
      /*
        Seven/five rather than an even split: the tree is the thing being read
        and needs the room for deep rows, while the detail panel is a fixed
        set of short fields. Stacks below xl, where two columns of this density
        stop being readable side by side.
      */
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {/* ---- BOM hierarchy ------------------------------------------- */}
        <section className="surface-panel min-w-0 xl:col-span-7">
          <div className="panel-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="label-caps">Bill of materials{view ? ` · ${view.bom.code} rev ${view.version.version}` : ""}</p>
              <h2 className="mt-1 truncate text-body-lg font-medium text-foreground">{product?.name ?? "—"}</h2>
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

          {productsQuery.isPending || (bomId && bomQuery.isPending) ? (
            <PanelLoading />
          ) : product && !product.bom ? (
            <EmptyState title={`No BOM recorded for ${product.name}`}
              description="This product is made in-house but has no bill of materials, so it can't be broken down into components." />
          ) : bomQuery.error ? (
            <EmptyState title="BOM could not be loaded" description={bomQuery.error.message}
              action={<button className={btnSecondary} onClick={() => void bomQuery.refetch()}>Try again</button>} />
          ) : view ? (
            <>
              <div className="overflow-x-auto p-2">
                <div className="min-w-[520px]">
                  <TreeNode node={view.tree} path={[0]} selected={selectedKey} onSelect={setSelectedKey} />
                </div>
              </div>
              <p className="border-t border-border px-4 py-2.5 text-body-sm text-muted-foreground">
                Materials cost roll-up{" "}
                <span className="font-medium text-foreground">
                  {view.cost.rolledMaterialCost === null ? "not calculable — a component has no standard cost" : `${rupees(view.cost.rolledMaterialCost)} per ${view.tree.uom}`}
                </span>
                {" "}incl. scrap · standard cost {view.cost.standardCost === null ? "—" : rupees(view.cost.standardCost)}. Labour and overhead aren't modelled.
              </p>
            </>
          ) : (
            <EmptyState title="No products to show" description="Finished and semi-finished goods appear here once they are recorded." />
          )}
        </section>

        {/* ---- Component details, revision & usage, failures ------------ */}
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

            {!selectedNode ? (
              <p className="p-4 text-body-sm text-muted-foreground">
                Click a component in the BOM tree to view details.
              </p>
            ) : detailQuery.isPending ? (
              <PanelLoading />
            ) : detailQuery.error ? (
              <EmptyState title="Component could not be loaded" description={detailQuery.error.message}
                action={<button className={btnSecondary} onClick={() => void detailQuery.refetch()}>Try again</button>} />
            ) : detail ? (
              <div className="space-y-4 p-4">
                <FieldGroup title="Inventory">
                  <Field label="Current stock" value={`${formatQty(detail.stock.total)} ${detail.material.uom}${detail.stock.byLocation.length ? ` (${detail.stock.byLocation.map((l) => `${l.name} ${formatQty(l.onHand)}`).join(" · ")})` : ""}`} />
                  <Field label="Open POs" value={openPoText} muted={detail.purchasing === null || openPos.length === 0} />
                </FieldGroup>
                <FieldGroup title="Suppliers">
                  <Field label="Primary vendor"
                    value={detail.procurementType === "MAKE" ? "Made in-house" : detail.vendors.primary ? `${detail.vendors.primary.name} (${detail.vendors.primary.leadTimeDays}d)` : "—"}
                    muted={!detail.vendors.primary} />
                  <Field label="Alternate vendor"
                    value={detail.vendors.alternates.length ? detail.vendors.alternates.map((v) => v.name).join(", ") : "None on record"}
                    muted={!detail.vendors.alternates.length} />
                </FieldGroup>
                <FieldGroup title="Cost">
                  <Field label="Standard cost" value={detail.material.standardCost === null ? "—" : `${rupees(detail.material.standardCost)}/${detail.material.uom}`} />
                  <Field label="Last purchase price"
                    value={detail.purchasing === null ? "Not permitted"
                      : detail.purchasing.lastPurchase ? `${rupees(detail.purchasing.lastPurchase.unitPrice)}/${detail.material.uom} (${detail.purchasing.lastPurchase.purchaseOrderNumber})`
                        : "No purchase recorded"}
                    muted={!detail.purchasing?.lastPurchase} />
                </FieldGroup>
              </div>
            ) : null}
          </section>

          {/* Revision & usage */}
          {view && (
            <section className="surface-panel">
              <div className="panel-head flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="label-caps flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-ebom" /> Revision &amp; usage
                </p>
                {detail && (
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium",
                    detail.material.isBatchTracked ? "bg-mbom/10 text-mbom" : "bg-muted text-muted-foreground")}>
                    {detail.material.isBatchTracked ? "LOT" : "NOT LOT-TRACKED"}
                  </span>
                )}
              </div>

              <div className="space-y-4 p-4">
                {/* Current state, read before the history that produced it. */}
                <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="sm:pr-4">
                    <Field label="Current rev" value={`${view.bom.code} · ${view.version.version}`} />
                  </div>
                  <div className="sm:pl-4">
                    <Field label="ECO" value="Not tracked" muted />
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
                          <th className="label-caps whitespace-nowrap py-1.5 pr-3">Effective</th>
                          <th className="label-caps whitespace-nowrap py-1.5 pr-3">ECO</th>
                          <th className="label-caps py-1.5">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.versions.map((v) => {
                          const isCurrent = v.id === view.version.id;
                          return (
                            <tr key={v.id} className={cn("border-b border-border last:border-b-0", isCurrent && "bg-sunken")}>
                              <td className="whitespace-nowrap py-1.5 pr-3 text-body-sm">
                                <span className={cn("font-medium", isCurrent ? "text-ebom" : "text-muted-foreground")}>{v.version}</span>
                              </td>
                              <td className="whitespace-nowrap py-1.5 pr-3 text-body-sm tabular-nums text-muted-foreground">
                                {fmtDate(v.effectiveFrom)}{v.effectiveTo ? ` – ${fmtDate(v.effectiveTo)}` : " onwards"}
                              </td>
                              <td className="identifier whitespace-nowrap py-1.5 pr-3 text-body-sm text-muted-foreground">—</td>
                              <td className="py-1.5 text-body-sm text-ink-secondary">
                                {v.isActive ? "Active" : "Inactive"} · {v.components} components per {formatQty(v.baseQuantity)} {view.tree.uom}
                              </td>
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
                    <div className="h-full rounded-full bg-ebom/40" style={{ width: `${view.version.effectivityProgress ?? 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-body-sm tabular-nums text-muted-foreground">
                    <span>{fmtDate(view.version.effectiveFrom)}</span>
                    <span>{view.version.effectiveTo ? fmtDate(view.version.effectiveTo) : "No end date"}</span>
                  </div>
                </div>

                {/* Where-used */}
                {selectedNode && (
                  <div className="border-t border-border pt-3">
                    <button onClick={() => setShowWhereUsed(!showWhereUsed)} className={`${btnLink} flex items-center gap-1`}>
                      <Search className="h-3 w-3" /> Where-used analysis — {selectedNode.code} →
                    </button>
                    {showWhereUsed && detail && (
                      <ul className="mt-2 space-y-1 rounded-lg bg-sunken p-3">
                        {detail.whereUsed.length ? detail.whereUsed.map((w, i) => (
                          <li key={i} className="text-body-sm text-ink-secondary">
                            • {w.product.name} <span className="identifier text-muted-foreground">({w.bomCode})</span>
                            {w.direct ? " — direct" : ` — via ${w.via.map((v) => v.name).join(" → ")}`}
                          </li>
                        )) : <li className="text-body-sm text-muted-foreground">Not used in any active BOM</li>}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Field failure rate — no source data exists for it. */}
          {view && (
            <section className="surface-panel">
              <div className="panel-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="label-caps">Field failure rate</p>
                <span className="text-body-sm text-muted-foreground">Last 12 months</span>
              </div>
              <EmptyState title="Field failure data isn't recorded" description="Anvaya has no field returns or failure records to chart yet." className="py-8" />
            </section>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
