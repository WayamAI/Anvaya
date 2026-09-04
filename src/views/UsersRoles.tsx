import StatusBadge from "@/components/StatusBadge";
import { Users, Shield } from "lucide-react";

const users = [
  { name: "Rajesh Kumar", email: "rajesh.kumar@matrixops.in", role: "Admin", dept: "Operations", lastLogin: "23 Mar 2026, 08:15", status: "Active" },
  { name: "Priya Sharma", email: "priya.sharma@matrixops.in", role: "Planner", dept: "Material Planning", lastLogin: "23 Mar 2026, 07:45", status: "Active" },
  { name: "Vikram Thakur", email: "vikram.thakur@matrixops.in", role: "Procurement", dept: "Purchase", lastLogin: "23 Mar 2026, 09:00", status: "Active" },
  { name: "Anita Desai", email: "anita.desai@matrixops.in", role: "Operations", dept: "Production", lastLogin: "23 Mar 2026, 06:30", status: "Active" },
  { name: "Suresh Patil", email: "suresh.patil@matrixops.in", role: "Operations", dept: "Production", lastLogin: "23 Mar 2026, 06:00", status: "Active" },
  { name: "Mohan Kulkarni", email: "mohan.kulkarni@matrixops.in", role: "Operations", dept: "Production", lastLogin: "22 Mar 2026, 18:00", status: "Active" },
  { name: "Ramesh Tiwari", email: "ramesh.tiwari@matrixops.in", role: "Operations", dept: "Production", lastLogin: "22 Mar 2026, 14:00", status: "Active" },
  { name: "Karthik Rajan", email: "karthik.rajan@matrixops.in", role: "Operations", dept: "Maintenance", lastLogin: "23 Mar 2026, 07:00", status: "Active" },
  { name: "Arun Mehra", email: "arun.mehra@matrixops.in", role: "Planner", dept: "Supply Chain", lastLogin: "22 Mar 2026, 16:30", status: "Active" },
  { name: "Neha Gupta", email: "neha.gupta@matrixops.in", role: "Procurement", dept: "Purchase", lastLogin: "21 Mar 2026, 11:00", status: "Active" },
  { name: "Deepak Joshi", email: "deepak.joshi@matrixops.in", role: "Admin", dept: "IT", lastLogin: "20 Mar 2026, 09:00", status: "Active" },
  { name: "Sunita Reddy", email: "sunita.reddy@matrixops.in", role: "Planner", dept: "Quality", lastLogin: "19 Mar 2026, 14:00", status: "Inactive" },
];

const roles = [
  { role: "Admin", users: 2, permissions: "Full system access — all modules, settings, user management" },
  { role: "Planner", users: 3, permissions: "Material planning, BOM, safety stock, MRP, forecasting, inventory view" },
  { role: "Procurement", users: 2, permissions: "Purchase orders, vendor management, procurement analytics, price management" },
  { role: "Operations", users: 5, permissions: "Production schedule, work orders, shop floor, inventory issue/receipt" },
];

const roleColors: Record<string, "green" | "amber" | "red" | "blue"> = { Admin: "red", Planner: "blue", Procurement: "amber", Operations: "green" };

export default function UsersRoles() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-lg font-semibold">Users & Roles</h2>

      </div>

      <div className="grid grid-cols-4 gap-3 animate-fade-in-up stagger-1">
        {roles.map((r, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-1">
              <StatusBadge status={roleColors[r.role]} label={r.role} />
              <span className="text-lg font-bold tabular-nums">{r.users}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{r.permissions}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-2">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/50 border-b border-border">
            {["Name", "Email", "Role", "Department", "Last Login", "Status"].map(h =>
              <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={i} className="border-b border-border hover:bg-secondary/30">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2"><StatusBadge status={roleColors[u.role]} label={u.role} /></td>
                <td className="px-3 py-2">{u.dept}</td>
                <td className="px-3 py-2">{u.lastLogin}</td>
                <td className="px-3 py-2"><StatusBadge status={u.status === "Active" ? "green" : "gray"} label={u.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
