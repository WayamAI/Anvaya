import { useQuery } from "@tanstack/react-query";
import { PageIcon } from "@/components/app/page-icon";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock, SkeletonTable } from "@/components/app/skeleton-block";
import { btnSecondary } from "@/components/app/controls";
import { apiGet } from "@/lib/api";
import { inrCompact, formatQty } from "@/lib/format";
import type { InventoryHealth as HealthData, MaterialHealth } from "@/server/inventory/health";

const scoreColor = (s: number) => (s >= 80 ? "text-success" : s >= 60 ? "text-warning" : "text-danger");

const cover = (m: MaterialHealth) => (m.coverDays === null ? "" : ` · ${Math.floor(m.coverDays)}d cover`);
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Bought materials need a purchase order; made ones a work order — per the planning policy. */
const replenish = (m: MaterialHealth) =>
  m.replenishment === "MAKE" ? "Schedule a work order"
    : m.replenishment === "MIXED" ? "Replenish — bought at some locations, made at others"
      : "Raise a purchase order";

/** The main penalty, from the same statuses Stock Overview shows. */
function penalty(m: MaterialHealth) {
  switch (m.issue) {
    case "critical": return m.onHand <= 0 ? "Out of stock" : `Below safety stock${cover(m)}`;
    case "low": return `Below reorder point${cover(m)}`;
    case "dead": return m.idleDays === null ? "Never moved" : `No movement in ${m.idleDays} days`;
    case "unplanned": return "No planning policy";
    default: return "None — within policy";
  }
}

function action(m: MaterialHealth) {
  switch (m.issue) {
    case "critical": return "Expedite replenishment";
    case "low": return replenish(m);
    case "dead": return "Review slow-moving stock";
    case "unplanned": return "Set reorder point and safety stock";
    default: return "Maintain current levels";
  }
}

/** One sentence per issue, built only from recorded figures. */
function recommendation(m: MaterialHealth) {
  const held = `${formatQty(m.onHand)} ${m.uom}`;
  const coverText = m.coverDays === null ? "" : ` — about ${days(Math.floor(m.coverDays))} of cover`;
  switch (m.issue) {
    case "critical":
      return m.onHand <= 0
        ? `Expedite ${m.name} (${m.code}) — none on hand against a safety stock requirement.`
        : `Expedite ${m.name} (${m.code}) — ${held} on hand is at or below safety stock${coverText}.`;
    case "low":
      return `${replenish(m)} for ${m.name} (${m.code}) — ${held} is at or below the reorder point${coverText}.`;
    case "dead":
      return `Review ${m.name} (${m.code}) — ${held} worth ${inrCompact(m.value)} has not moved ${m.idleDays === null ? "since it was received" : `for ${days(m.idleDays)}`}.`;
    case "unplanned":
      return `Set a planning policy for ${m.name} (${m.code}) — ${held} is held with no reorder point or safety stock.`;
    default:
      return "";
  }
}

export default function InventoryHealth() {
  const q = useQuery({
    queryKey: ["inventory", "health"],
    queryFn: ({ signal }) => apiGet<HealthData>("/inventory/health", undefined, { signal }),
  });

  const title = (
    <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
        <PageIcon />
        <span className="min-w-0">Inventory health scoring</span>
      </h1>
  );

  if (q.error) {
    return (
      <div className="px-6 py-5 space-y-6">
        {title}
        <div className="surface-panel">
          <EmptyState title="Inventory health could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="px-6 py-5 space-y-6" aria-busy="true">
        {title}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-24" />)}
        </div>
        <SkeletonTable rows={8} cols={4} />
      </div>
    );
  }

  const h = q.data;

  if (h.totals.skus === 0) {
    return (
      <div className="px-6 py-5 space-y-6">
        {title}
        <EmptyState title="No materials yet" description="Inventory health is scored once materials and stock are recorded." />
      </div>
    );
  }

  const { availability, turnover, excess } = h.components;
  const score = h.overall.score;
  const deadShare = excess.totalValue > 0 ? Math.round((excess.deadValue / excess.totalValue) * 100) : null;

  const subScores = [
    {
      label: "Stock availability",
      score: availability.score,
      note: availability.planned
        ? `${availability.adequate} of ${availability.planned} planned materials above reorder point`
        : "No materials have a planning policy",
    },
    {
      label: "Turnover efficiency",
      score: turnover.score,
      note: `Needs consumption history — ${turnover.outboundMovements12m} outbound movement${turnover.outboundMovements12m === 1 ? "" : "s"} in the last 12 months`,
    },
    {
      label: "Excess & obsolescence",
      score: excess.score,
      note: deadShare === null ? "No stock value on hand" : `${deadShare}% of stock value idle ${excess.deadStockDays}+ days`,
    },
  ];

  const worst = h.materials.filter((m) => m.score !== null).slice(0, 10);

  return (
    <div className="px-6 py-5 space-y-6">
      {title}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 text-center">
          <div className={`text-display-4xl font-semibold tabular-nums ${score === null ? "text-muted-foreground" : score >= h.target ? "text-success" : "text-warning"}`}>{score ?? "—"}</div>
          <div className="text-body-md text-muted-foreground mt-1">/ 100</div>
          <div className={`text-body-sm font-medium mt-2 ${score === null ? "text-muted-foreground" : score >= h.target ? "text-success" : "text-warning"}`}>
            {score === null ? "Not enough data to score" : score >= h.target ? `At or above ${h.target} target` : `Below ${h.target} target`}
          </div>
          {score !== null && h.overall.basedOn.length < 3 && (
            <div className="text-caption text-muted-foreground mt-1">From {h.overall.basedOn.length} of 3 measures</div>
          )}
        </div>
        {subScores.map((s) => (
          <div key={s.label} title={s.note}>
            <div className={`text-display-xl leading-none tabular-nums ${s.score === null ? "text-muted-foreground" : s.score >= 80 ? "text-success" : "text-warning"}`}>{s.score ?? "—"}</div>
            <div className="text-body-sm text-muted-foreground mt-1">{s.label}</div>
            <div className="w-full h-1.5 bg-secondary rounded-full mt-3">
              {s.score !== null && <div className={`h-full rounded-full ${s.score >= 80 ? "bg-success" : "bg-warning"}`} style={{ width: `${s.score}%` }} />}
            </div>
            <div className="text-caption text-muted-foreground mt-1.5">{s.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div>
            <h3 className="text-body-md font-semibold mb-3">Score trend (12 months)</h3>
            <div className="h-[200px] rounded-lg border border-border flex items-center justify-center">
              <EmptyState title="No score history yet" description="Health scores aren't stored over time yet, so there is no trend to show." />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-body-md">
              <thead><tr className="border-b border-border">
                {["Material", "Score", "Main penalty", "Suggested action"].map(hd => <th key={hd} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{hd}</th>)}
              </tr></thead>
              <tbody>
                {worst.map((m) => (
                  <tr key={m.materialId} className="border-b border-border hover:bg-sunken">
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold tabular-nums ${scoreColor(m.score!)}`}>{m.score}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{penalty(m)}</td>
                    <td className="px-3 py-2">{action(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {worst.length === 0 && <EmptyState title="Nothing to score" description="No material has a planning policy or stock on hand." />}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-body-md font-semibold mb-3">Top {h.recommendations.length || 5} recommendations</h3>
            <div className="space-y-3">
              {h.recommendations.length > 0 ? h.recommendations.map((m, i) => (
                <div key={m.materialId} className="p-3 rounded-lg bg-secondary/60 text-body-sm leading-relaxed">
                  <span className="font-semibold text-muted-foreground mr-1">{i + 1}.</span> {recommendation(m)}
                </div>
              )) : <div className="text-body-sm text-muted-foreground">No stock issues to act on.</div>}
            </div>
          </div>

          <div>
            <h3 className="text-body-md font-semibold mb-1">Stock value by location</h3>
            <p className="text-caption text-muted-foreground mb-2">{inrCompact(h.totals.value)} across {h.totals.stockedSkus} stocked materials</p>
            <table className="data-table w-full text-body-sm">
              <tbody>
                {h.byLocation.map((l) => (
                  <tr key={l.key} className="border-b border-border">
                    <td className="px-2 py-1.5 font-medium">{l.label}</td>
                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{l.skus} SKUs</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.value > 0 ? inrCompact(l.value) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">{l.share === null || l.value === 0 ? "—" : `${l.share}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-body-md font-semibold mb-2">Stock value by category</h3>
            <table className="data-table w-full text-body-sm">
              <tbody>
                {h.byCategory.map((c) => (
                  <tr key={c.key} className="border-b border-border">
                    <td className="px-2 py-1.5 font-medium">{c.label}</td>
                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums whitespace-nowrap" title="Materials at or below reorder point">
                      {c.belowReorderPoint > 0 ? `${c.belowReorderPoint} low` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{c.value > 0 ? inrCompact(c.value) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">{c.share === null || c.value === 0 ? "—" : `${c.share}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
