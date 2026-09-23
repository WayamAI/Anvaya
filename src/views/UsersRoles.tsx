import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";

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

type User = (typeof users)[number];

export default function UsersRoles() {
  const columns: Column<User>[] = [
    { key: "name", header: "Name", value: u => u.name, cell: u => <span className="font-medium">{u.name}</span> },
    { key: "email", header: "Email", value: u => u.email, cell: u => <span className="text-muted-foreground">{u.email}</span> },
    { key: "role", header: "Role", width: "w-[130px]", value: u => u.role, cell: u => <StatusBadge status={roleColors[u.role]} label={u.role} /> },
    { key: "dept", header: "Department", width: "w-[160px]", value: u => u.dept, cell: u => u.dept },
    { key: "lastLogin", header: "Last login", width: "w-[170px]", value: u => u.lastLogin, cell: u => <span className="whitespace-nowrap">{u.lastLogin}</span> },
    { key: "status", header: "Status", width: "w-[110px]", value: u => u.status, cell: u => <StatusBadge status={u.status === "Active" ? "green" : "gray"} label={u.status} /> },
  ];

  return (
    <div className="px-6 py-5">
      <PageHeader title="Users & roles" description={`${users.length} users across ${roles.length} roles`} />

      <Section title="Roles" className="mb-8">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map(r => (
            <div key={r.role} className="border-t border-border pt-3">
              <dt className="flex items-center justify-between">
                <StatusBadge status={roleColors[r.role]} label={r.role} />
                <span className="text-heading-sm tabular-nums text-foreground">{r.users}</span>
              </dt>
              <dd className="mt-1.5 text-body-sm text-muted-foreground">{r.permissions}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Users">
        <DataTable
          columns={columns}
          rows={users}
          rowKey={u => u.email}
          name="Users"
          searchable
          exportable
          empty={<EmptyState title="No users" description="No accounts match this view." />}
        />
      </Section>
    </div>
  );
}
