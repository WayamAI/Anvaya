import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
}

const entries: ActivityEntry[] = [
  { id: "a1", time: "14:34", actor: "AI Planner", action: "flagged", target: "EXT-002 barrel temperature" },
  { id: "a2", time: "14:12", actor: "S. Kulkarni", action: "acknowledged", target: "CNC-014 spindle load" },
  { id: "a3", time: "13:48", actor: "MRP run", action: "rescheduled", target: "42 work orders on Line 4" },
  { id: "a4", time: "13:05", actor: "K. Iyer", action: "released", target: "PO-2214 to Meridian Alloys" },
  { id: "a5", time: "12:20", actor: "N. Bhosale", action: "closed", target: "BATCH-77A quality hold" },
];

export function RecentActivity({ className }: { className?: string }) {
  return (
    <section className={cn("cc-panel p-4", className)} aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-[13px] font-medium leading-none text-primary">
        Recent Activity
      </h2>
      <ul className="mt-3.5 space-y-0">
        {entries.map((entry, i) => (
          <li
            key={entry.id}
            className={cn(
              "flex items-baseline gap-3 py-2 text-[12px] leading-none",
              i !== entries.length - 1 && "border-b border-subtle",
            )}
          >
            <time className="w-[38px] shrink-0 tabular-nums text-muted">{entry.time}</time>
            <p className="min-w-0 truncate text-secondary">
              <span className="text-primary">{entry.actor}</span> {entry.action}{" "}
              <span className="text-primary">{entry.target}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
