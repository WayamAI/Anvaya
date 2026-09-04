import RequireAuth from "@/components/auth/RequireAuth";

/** The shell owns the full viewport, so it sits outside the standard app chrome. */
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
