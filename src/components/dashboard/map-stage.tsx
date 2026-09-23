import { cn } from "@/lib/utils";
import type { HealthTone } from "./health-score-card";

export interface MapMarker {
  id: string;
  /** CSS position within the stage, e.g. "42%". Not geographic. */
  x: string;
  y: string;
  tone: HealthTone;
}

interface MapStageProps {
  markers?: MapMarker[];
  /** Accessible name for the region, e.g. "Fleet map". */
  label?: string;
  children?: React.ReactNode;
  className?: string;
}

const markerTone: Record<HealthTone, string> = {
  healthy: "bg-feedback-success",
  warning: "bg-feedback-warning",
  critical: "bg-feedback-critical",
};

/**
 * Placeholder for the live map.
 *
 * Renders the muted dark plate a real map will sit on and nothing that would
 * fight it, so a Mapbox (or similar) canvas can later be dropped in as an
 * absolutely positioned child with no layout change. The stage establishes the
 * positioning context; overlays are passed as `children` and place themselves
 * against it.
 */
export function MapStage({ markers = [], label = "Map", children, className }: MapStageProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "relative isolate overflow-hidden rounded-cc-xl border border-subtle",
        "cc-map-surface cc-inner-highlight",
        className,
      )}
    >
      {/* Placeholder geography: soft routes, no tile layer yet. */}
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

      {/* Markers — placeholder positions; real ones arrive with the tile layer. */}
      {markers.length > 0 && (
        <div className="absolute inset-0" aria-hidden="true">
          {markers.map((m) => (
            <span
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: m.x, top: m.y }}
            >
              {m.tone === "critical" && (
                <span className="absolute -inset-2 rounded-full border border-feedback-critical/35" />
              )}
              <span
                className={cn(
                  "block h-1.5 w-1.5 rounded-full ring-2 ring-black/40",
                  markerTone[m.tone],
                  m.tone === "healthy" && "opacity-55",
                )}
              />
            </span>
          ))}
        </div>
      )}

      {/* Vignette keeps the edges from competing with the floating cards. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,transparent_35%,rgba(0,0,0,0.5)_100%)]"
        aria-hidden="true"
      />

      {children}
    </section>
  );
}
