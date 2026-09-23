import StatusBadge from "@/components/StatusBadge";

import { btnSecondarySm } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";
const updates = [
  { time: "2 min ago", type: "Material Issue", desc: "RM-2087 Stearic Acid issued 120 kg to WO-2026-0847 (Line 3)", user: "Suresh P.", wo: "WO-2026-0847" },
  { time: "8 min ago", type: "Production Start", desc: "WO-2026-0847 — Industrial Cleaner 5L — Line 3 started batch production", user: "System", wo: "WO-2026-0847" },
  { time: "15 min ago", type: "QC Passed", desc: "Batch B-2026-0412 — All 14 quality parameters within specification", user: "QC Lab", wo: "WO-2026-0840" },
  { time: "22 min ago", type: "Quantity Update", desc: "WO-2026-0840 — Hand Wash 250ml — produced 6,200 of 10,000 (62%)", user: "System", wo: "WO-2026-0840" },
  { time: "35 min ago", type: "Delay Alert", desc: "WO-2026-0849 — Dish Wash Liquid delayed — material shortage (Stearic Acid)", user: "System", wo: "WO-2026-0849" },
  { time: "42 min ago", type: "Schedule Change", desc: "WO-2026-0852 — Toilet Cleaner moved from 26 Mar to 27 Mar due to Line 2 maintenance", user: "Anita D.", wo: "WO-2026-0852" },
  { time: "1 hr ago", type: "Material Receipt", desc: "GRN-2026-0498 — HDPE Resin 2,000 kg received at Pune Plant from Reliance Polymers", user: "Warehouse", wo: "—" },
  { time: "1 hr ago", type: "Completion", desc: "WO-2026-0838 — Toilet Cleaner 500ml — 6,000 units completed, sent to QC", user: "Mohan K.", wo: "WO-2026-0838" },
  { time: "1.5 hr ago", type: "Shift Handover", desc: "Shift A → Shift B handover completed — Line 1, 2, 3, 4 — all readings normal", user: "Ramesh T.", wo: "—" },
  { time: "2 hr ago", type: "Rework", desc: "Batch B-2026-0395 — 200 units of Dish Wash flagged for viscosity adjustment", user: "QC Lab", wo: "WO-2026-0835" },
  { time: "2.5 hr ago", type: "Production Start", desc: "WO-2026-0840 — Hand Wash 250ml — Line 4 started second run", user: "System", wo: "WO-2026-0840" },
  { time: "3 hr ago", type: "Material Alert", desc: "Fragrance Blend FG-04 stock below safety level — 22 L remaining", user: "System", wo: "—" },
];

const typeColors: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  "Material Issue": "blue", "Production Start": "green", "QC Passed": "green",
  "Quantity Update": "blue", "Delay Alert": "red", "Schedule Change": "amber",
  "Material Receipt": "green", "Completion": "green", "Shift Handover": "gray",
  "Rework": "amber", "Material Alert": "red",
};

export default function ScheduleUpdates() {
  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Schedule updates (real-time)</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-body-sm text-success"><span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live</span>
          <button className={btnSecondarySm}>Refresh</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="divide-y divide-border">
          {updates.map((u, i) => (
            <div key={i} className="px-4 py-3 hover:bg-sunken transition-colors flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <StatusBadge status={typeColors[u.type] || "gray"} label={u.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-md">{u.desc}</p>
                <div className="flex items-center gap-3 mt-1 text-body-sm text-muted-foreground">
                  <span>{u.time}</span>
                  <span>by {u.user}</span>
                  {u.wo !== "—" && <span className="identifier text-foreground">{u.wo}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
