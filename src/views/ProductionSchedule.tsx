import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import StatusBadge from "@/components/StatusBadge";
import { EmptyState } from "@/components/app/empty-state";
import { SkeletonBlock } from "@/components/app/skeleton-block";
import { btnLink, btnSecondary, btnSecondarySm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
import { apiGet } from "@/lib/api";
import { formatQty } from "@/lib/format";
import {
  addDaysIso, assignLanes, fitWindow, placeBar,
  type ScheduleBar, type ScheduleConstraint, type ScheduleOrder, type ScheduleView, type ScheduleWindow,
} from "@/server/production/schedule";
import type { WorkOrderStatus } from "@/server/production/work-orders";

type Filter = "all" | "open" | "overdue" | "completed";

const statusBadge: Record<WorkOrderStatus, { status: "green" | "amber" | "blue" | "gray"; label: string }> = {
  PLANNED: { status: "gray", label: "Planned" },
  FIRMED: { status: "blue", label: "Firmed" },
  RELEASED: { status: "blue", label: "Released" },
  IN_PROGRESS: { status: "amber", label: "In Progress" },
  COMPLETED: { status: "green", label: "Completed" },
  CLOSED: { status: "green", label: "Closed" },
  CANCELLED: { status: "gray", label: "Cancelled" },
};

const finished = (s: WorkOrderStatus) => s === "COMPLETED" || s === "CLOSED" || s === "CANCELLED";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const hours = (minutes: number) => `${formatQty(minutes / 60)} h`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

function barClass(b: ScheduleBar) {
  if (b.overdue) return "bg-destructive";
  if (finished(b.status)) return "bg-primary/40";
  return "bg-primary";
}

function constraintText(c: ScheduleConstraint): string {
  switch (c.kind) {
    case "SHORTAGE": {
      const parts = c.shortages!.map((s) => `${s.code} ${formatQty(s.shortfall)} ${s.uom}`).join(", ");
      const supply = c.plannedSupply?.length
        ? ` ${c.plannedSupply.map((p) => `${p.orderNumber} is planned to make ${formatQty(p.quantity)} ${p.uom} of ${p.materialCode} by ${fmtDay(p.plannedEnd)}`).join("; ")} — planned production isn't counted as available stock.`
        : "";
      return `${c.orderNumber} short at its location: ${parts}.${supply}`;
    }
    case "OVERDUE":
      return `${c.orderNumber} is still open, ${c.overdueDays} days past its planned end.`;
    case "OVERLAP":
      return `${c.overlap!.orders.join(" and ")} both on ${c.overlap!.workCentre}, ${fmtDay(c.overlap!.from)}–${fmtDay(c.overlap!.to)}.`;
    case "CAPACITY_LOAD":
      return `${c.load!.workCentre} planned at ${formatQty(c.load!.peak!.load)} ${c.load!.constraint!.unit} on ${fmtDay(c.load!.peak!.date)} — ${c.load!.peak!.pct}% of ${formatQty(c.load!.constraint!.capacity)}.`;
    case "STORED": {
      const s = c.stored!;
      const cap = s.capacity === null ? "no capacity set" : `${formatQty(s.utilised)} / ${formatQty(s.capacity)} ${s.unit ?? ""}${s.recordedPct === null ? "" : ` (${s.recordedPct}%)`}`;
      return `${s.type.toLowerCase()} · ${s.location.name} · ${cap.trim()} as recorded`;
    }
  }
}

function Gantt({ view, bars, range, setRange, fitted }: {
  view: ScheduleView;
  bars: ScheduleBar[];
  range: ScheduleWindow;
  setRange: (w: ScheduleWindow) => void;
  fitted: ScheduleWindow;
}) {
  const days = Array.from({ length: range.days }, (_, i) => addDaysIso(range.start, i));
  const step = Math.max(1, Math.ceil(range.days / 10));
  const today = todayIso();
  const end = days[days.length - 1];
  const todayPos = today >= range.start && today <= end ? placeBar({ start: today, end: today }, range) : null;
  const rows = view.workCentres.map((wc) => ({
    wc,
    bars: assignLanes(bars.filter((b) => b.workCentre === wc)).flatMap((b) => {
      const pos = placeBar(b, range);
      return pos ? [{ ...b, pos }] : [];
    }),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="text-body-sm text-muted-foreground tabular-nums">{fmtDate(range.start)} – {fmtDate(end)}</span>
        <div className="flex items-center gap-1">
          <button className={btnSecondarySm} onClick={() => setRange({ ...range, start: addDaysIso(range.start, -range.days) })}>← Prev</button>
          <button className={btnSecondarySm} onClick={() => setRange(fitted)} disabled={range.start === fitted.start && range.days === fitted.days}>Fit</button>
          <button className={btnSecondarySm} onClick={() => setRange({ ...range, start: addDaysIso(range.start, range.days) })}>Next →</button>
        </div>
      </div>
      <div className="flex mb-3">
        <div className="w-20" />
        <div className="flex-1 flex text-caption text-muted-foreground">
          {days.map((d, i) => (
            <div key={d} className="flex-1 min-w-0 border-l border-border pl-1 whitespace-nowrap">{i % step === 0 ? fmtDay(d) : ""}</div>
          ))}
        </div>
      </div>
      {rows.map(({ wc, bars: placed }) => {
        const lanes = Math.max(1, ...placed.map((b) => b.lane + 1));
        return (
          <div key={wc} className="flex items-center mb-2">
            <div className="w-20 text-body-sm font-medium text-muted-foreground identifier">{wc}</div>
            <div className="flex-1 bg-secondary/50 rounded relative" style={{ height: `${lanes * 28 + 4}px` }}>
              {todayPos && <div className="absolute top-0 bottom-0 border-l-2 border-foreground/60" style={{ left: `${todayPos.left + todayPos.width / 2}%` }} title={`Today, ${fmtDate(today)}`} />}
              {placed.map((b) => (
                <div
                  key={`${b.orderId}-${wc}`}
                  className={`absolute h-6 rounded ${barClass(b)} flex items-center px-1.5 text-caption font-medium text-primary-foreground truncate`}
                  style={{ left: `${b.pos.left}%`, width: `${b.pos.width}%`, top: `${b.lane * 28 + 4}px` }}
                  title={`${b.orderNumber} · ${b.product.name}\n${fmtDate(b.start)} – ${fmtDate(b.end)} (${b.days} day${b.days === 1 ? "" : "s"}, whole days — operation times aren't recorded)\n${statusBadge[b.status].label}${b.overdue ? " · overdue" : ""}\nSetup ${b.setupMinutes} min + run ${b.runMinutes} min on ${wc}`}
                >
                  {b.orderNumber} · {b.product.name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-caption text-muted-foreground">
        Bars span each order's planned dates on every work centre in its route, in whole days.{" "}
        {todayPos ? "The vertical line marks today." : `Today (${fmtDate(today)}) is ${today > end ? "after" : "before"} this range.`}
      </p>
    </div>
  );
}

export default function ProductionSchedule() {
  const router = useRouter();
  const [view, setView] = useState<"gantt" | "list">("gantt");
  const [filter, setFilter] = useState<Filter>("all");
  const [range, setRange] = useState<ScheduleWindow | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const q = useQuery({
    queryKey: ["production-schedule"],
    queryFn: ({ signal }) => apiGet<ScheduleView>("/production/schedule", undefined, { signal }),
  });

  // Keeps "Last updated" honest without refetching.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const data = q.data;
  const inFilter = (o: { status: WorkOrderStatus; overdue: boolean }) =>
    filter === "all" ? true : filter === "open" ? !finished(o.status) : filter === "overdue" ? o.overdue : o.status === "COMPLETED" || o.status === "CLOSED";

  const orders: ScheduleOrder[] = useMemo(
    () => (data?.orders ?? []).filter(inFilter).sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filter],
  );
  const bars = useMemo(() => (data?.bars ?? []).filter(inFilter), // eslint-disable-line react-hooks/exhaustive-deps
    [data, filter]);
  const fitted = useMemo(() => fitWindow(bars), [bars]);

  // Refit whenever the orders shown change.
  useEffect(() => setRange(fitted), [fitted]);

  const constraints = data?.constraints ?? [];

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Production schedule</span>
        </h1>
          <span className="text-body-sm text-muted-foreground">
            {q.dataUpdatedAt ? `Last updated: ${ago(q.dataUpdatedAt, now)}` : q.isPending ? "Loading…" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-secondary rounded-lg p-0.5">
            {(["all", "open", "overdue", "completed"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-[6px] px-3 py-1 text-body-sm font-medium capitalize transition-colors ${filter === f ? "bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
            ))}
          </div>
          <div className="flex bg-secondary rounded-lg p-0.5">
            <button onClick={() => setView("gantt")} className={`rounded-[6px] px-3 py-1 text-body-sm font-medium transition-colors ${view === "gantt" ? "bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground hover:text-foreground"}`}>Gantt</button>
            <button onClick={() => setView("list")} className={`rounded-[6px] px-3 py-1 text-body-sm font-medium transition-colors ${view === "list" ? "bg-card text-foreground shadow-[0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground hover:text-foreground"}`}>List</button>
          </div>
          <button className={btnSecondarySm} onClick={() => { void q.refetch(); setNow(Date.now()); }} disabled={q.isFetching}>
            {q.isFetching && !q.isPending ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {q.error ? (
        <div className="surface-panel">
          <EmptyState title="Schedule could not be loaded" description={q.error.message}
            action={<button className={btnSecondary} onClick={() => void q.refetch()}>Try again</button>} />
        </div>
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="col-span-3">
          {q.isPending ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No work orders to schedule" : `No ${filter} work orders`}
              description={filter === "all" ? "Work orders appear here once production is planned." : "Try another filter."} />
          ) : view === "gantt" ? (
            range && fitted && data ? <Gantt view={data} bars={bars} range={range} setRange={setRange} fitted={fitted} /> : null
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-body-md">
                <thead>
                  <tr className="border-b border-border">
                    {["Work order", "Product", "Batch size", "Start", "End", "Line", "Material", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border hover:bg-sunken transition-colors">
                      <td className="px-3 py-2 identifier text-body-sm whitespace-nowrap">{o.orderNumber}</td>
                      <td className="px-3 py-2 font-medium">{o.product.name}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatQty(o.plannedQty)} {o.uom}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(o.plannedStartDate)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={o.overdue ? "text-danger font-medium" : ""}>{fmtDate(o.plannedEndDate)}</span>
                        {o.overdue && <span className="text-caption text-danger"> (overdue)</span>}
                      </td>
                      <td className="px-3 py-2 identifier text-body-sm" title={`Setup ${o.setupMinutes} min + run ${o.runMinutes} min (${hours(o.setupMinutes + o.runMinutes)})`}>
                        {o.workCentres.length ? o.workCentres.join(" → ") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {o.shortages === null ? (
                          <span className="text-muted-foreground" title="Order finished — readiness not assessed">—</span>
                        ) : (
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full ${o.shortages.length ? "bg-destructive" : "bg-primary"}`}
                            title={o.shortages.length
                              ? `${o.shortages.length} short: ${o.shortages.map((s) => `${s.code} ${formatQty(s.shortfall)} ${s.uom}`).join(", ")}`
                              : "All components available at the order's location"}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusBadge {...statusBadge[o.status]} /></td>
                      <td className="px-3 py-2"><button className={btnLink} onClick={() => router.push("/work-orders")}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Constraints Panel */}
        <div>
          <h3 className="text-body-md font-semibold mb-3">Active constraints ({q.isPending ? "—" : constraints.length})</h3>
          <div className="space-y-3">
            {q.isPending ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-16 w-full" />)
            ) : constraints.length ? constraints.map((c, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-body-sm font-medium">{c.title}</span>
                  <StatusBadge status={c.severity === "High" ? "red" : c.severity === "Medium" ? "amber" : "green"} label={c.severity} />
                </div>
                <p className="text-body-sm text-muted-foreground">{constraintText(c)}</p>
              </div>
            )) : <p className="text-body-sm text-muted-foreground">No constraints recorded.</p>}
            {data && data.loads.some((l) => l.constraint) && (
              <div className="p-2.5 rounded-lg border border-dashed border-border text-body-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Planned load vs capacity</p>
                {data.loads.filter((l) => l.constraint).map((l) => (
                  <p key={l.workCentre}>
                    <span className="identifier">{l.workCentre}</span>:{" "}
                    {l.peak ? `peak ${formatQty(l.peak.load)} ${l.constraint!.unit} on ${fmtDay(l.peak.date)} (${l.peak.pct}% of ${formatQty(l.constraint!.capacity)})` : "no comparable orders"}
                    {l.notComparable.length > 0 && ` · not comparable (unit differs): ${l.notComparable.join(", ")}`}
                  </p>
                ))}
                {data.loads.some((l) => !l.constraint) && (
                  <p>No capacity record for {data.loads.filter((l) => !l.constraint).map((l) => l.workCentre).join(", ")}.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
