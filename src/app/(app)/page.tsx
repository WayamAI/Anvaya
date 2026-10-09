"use client";

import Dashboard from "@/views/Dashboard";
import { LegacyIconScope } from "@/components/icons/chronos";

// The Dashboard keeps its original icons; the Chronos set applies everywhere else.
export default function DashboardPage() {
  return (
    <LegacyIconScope>
      <Dashboard />
    </LegacyIconScope>
  );
}
