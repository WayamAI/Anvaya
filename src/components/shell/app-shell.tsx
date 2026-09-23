"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children?: React.ReactNode;
  /**
   * Optional details column. Persistent from `xl`; below that it becomes an
   * overlay drawer opened from a control in the main column, because a
   * 320px panel and a usable main area do not both fit.
   *
   * A render function rather than a node, so the drawer can hand the panel a
   * dismiss handler while the persistent column renders without one.
   */
  panel?: (props: { onClose?: () => void }) => React.ReactNode;
  /** Accessible name for the control that opens the drawer. */
  panelLabel?: string;
  className?: string;
}

/**
 * Full-viewport application frame: fixed rail, flexible main column, optional
 * details panel. The page itself never scrolls — inner regions own their
 * overflow, so the frame stays put.
 */
export function AppShell({ children, panel, panelLabel = "Open details", className }: AppShellProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className={cn("cc-root flex h-dvh w-full overflow-hidden bg-page font-sans text-secondary", className)}>
      <Sidebar />

      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {panel && (
          <IconButton
            icon="layers"
            label={panelLabel}
            size="sm"
            variant="subtle"
            className="absolute right-6 top-5 z-10 xl:hidden"
            onClick={() => setPanelOpen(true)}
          />
        )}
        {children}
      </main>

      {panel && <div className="hidden w-[320px] shrink-0 xl:block">{panel({})}</div>}

      {panel && panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div className="cc-root relative h-full w-full bg-surface-container shadow-cc-panel sm:w-[340px]">
            {panel({ onClose: () => setPanelOpen(false) })}
          </div>
        </div>
      )}
    </div>
  );
}
