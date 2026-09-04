import RequireAuth from "@/components/auth/RequireAuth";
import AppLayout from "@/components/layout/AppLayout";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}
