import type { Metadata } from "next";
import RequireAuth from "@/components/auth/RequireAuth";

export const metadata: Metadata = {
  title: "Fleet — Anvaya",
  description: "Fleet telemetry dashboard.",
};

/** The shell owns the full viewport, so it sits outside the standard app chrome. */
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
