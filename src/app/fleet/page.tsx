import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Fleet — Anvaya",
  description: "Fleet telemetry application shell.",
};

export default function FleetPage() {
  return (
    <AppShell>
      {/* Temporary, to verify spacing. Dashboard content lands here next. */}
      <div className="px-6 pt-5">
        <h1 className="text-[27px] font-light leading-none tracking-[-0.02em] text-primary">
          Dashboard
        </h1>
      </div>
    </AppShell>
  );
}
