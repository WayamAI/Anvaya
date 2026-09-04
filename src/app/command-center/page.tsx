import type { Metadata } from "next";
import { DashboardShell } from "@/components/command-center/dashboard-shell";

export const metadata: Metadata = {
  title: "Command Center — Anvaya",
  description: "Live plant health, exception queue and asset telemetry.",
};

export default function CommandCenterPage() {
  return <DashboardShell />;
}
