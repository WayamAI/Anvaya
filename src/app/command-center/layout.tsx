import RequireAuth from "@/components/auth/RequireAuth";

/**
 * The command center owns the full viewport — it deliberately sits outside the
 * standard app chrome (sidebar + header), since it carries its own.
 */
export default function CommandCenterLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
