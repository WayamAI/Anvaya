import { cn } from "@/lib/utils";

interface PlantStageProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Placeholder asset positions. These stand in for map features and are replaced
 * wholesale once a real tile layer + geocoded assets are wired in.
 */
const markers = [
  { id: "m1", x: "31%", y: "58%", severity: "healthy" },
  { id: "m2", x: "44%", y: "39%", severity: "healthy" },
  { id: "m3", x: "58%", y: "63%", severity: "warning" },
  { id: "m4", x: "66%", y: "31%", severity: "healthy" },
  { id: "m5", x: "72%", y: "54%", severity: "critical" },
  { id: "m6", x: "83%", y: "44%", severity: "healthy" },
  { id: "m7", x: "24%", y: "36%", severity: "healthy" },
] as const;

const markerTone: Record<(typeof markers)[number]["severity"], string> = {
  healthy: "bg-feedback-success",
  warning: "bg-feedback-warning",
  critical: "bg-feedback-critical",
};

/**
 * Placeholder for the site/plant map.
 *
 * Renders the muted dark plate the real map will sit on, and nothing else, so
 * a Mapbox (or similar) canvas can later be dropped in as an absolutely
 * positioned child without any layout change. Overlays are passed as
 * `children` and positioned against this element.
 */
export function PlantStage({ children, className }: PlantStageProps) {
  return (
    <section
      aria-label="Plant map"
      className={cn(
        "relative isolate overflow-hidden rounded-cc-xl border border-subtle",
        "cc-map-surface cc-inner-highlight",
        className,
      )}
    >
      {/* Placeholder geography: soft routes + site markers, no tile layer yet. */}
      <svg
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
        viewBox="0 0 800 400"
      >
        <g className="text-stroke-subtle" stroke="currentColor" fill="none" strokeWidth="1.25">
          <path d="M-20 292 C 150 268, 268 214, 396 208 S 660 178, 830 128" />
          <path d="M-20 344 C 190 322, 300 286, 430 268 S 690 232, 830 196" />
          <path d="M118 -20 C 142 120, 214 216, 318 300 S 470 392, 512 430" />
        </g>
        <g className="text-stroke" stroke="currentColor" fill="none" strokeWidth="1.5">
          <path d="M-20 236 C 176 208, 316 160, 470 148 S 700 108, 830 70" />
        </g>
      </svg>

      {/* Asset markers — placeholder positions, not geographic. */}
      <div className="absolute inset-0" aria-hidden="true">
        {markers.map((m) => (
          <span
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: m.x, top: m.y }}
          >
            {m.severity === "critical" && (
              <span className="absolute -inset-2 rounded-full border border-feedback-critical/35" />
            )}
            <span
              className={cn(
                "block h-1.5 w-1.5 rounded-full ring-2 ring-black/40",
                markerTone[m.severity],
                m.severity === "healthy" && "opacity-55",
              )}
            />
          </span>
        ))}
      </div>

      {/* Vignette keeps the edges from competing with the floating cards. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,transparent_35%,rgba(0,0,0,0.5)_100%)]"
        aria-hidden="true"
      />

      {children}
    </section>
  );
}
