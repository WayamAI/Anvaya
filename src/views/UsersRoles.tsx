import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorNote } from "@/components/app/api-error-note";
import { btnGhostSm, btnPrimary, btnSecondary, inputSm } from "@/components/app/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/auth/session-context";
import { apiGet, apiSend } from "@/lib/api";

/**
 * Users and roles, from the server. Every action is re-checked server-side,
 * including that an administrator can only grant what they hold.
 */

interface RoleRef { id: string; code: string; name: string }
interface UserRow {
  id: string; email: string; name: string; isActive: boolean; locked: boolean; mustChangePassword: boolean;
  lastLoginAt: string | null; roles: RoleRef[];
}
interface RoleRow { id: string; code: string; name: string; description: string | null; isSystem: boolean; users: number; permissions: string[] }

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
const label = "block text-caption text-muted-foreground mb-1";
const DONE = { activate: "reactivated", deactivate: "deactivated and signed out", reset: "password reset", unlock: "unlocked" } as const;

/** Shows a server-issued temporary password exactly once. */
function PasswordReveal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            Give this to {email} through a trusted channel. It is shown only now; they must set their own password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <code className="block select-all rounded-md border border-border bg-secondary px-3 py-2 font-mono text-body-md">{password}</code>
        <DialogFooter>
          <button className={btnSecondary} onClick={() => void navigator.clipboard?.writeText(password).then(() => toast.success("Copied"))}>Copy</button>
          <button className={btnPrimary} onClick={onClose}>Done</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserDialog({ user, roles, onClose, onIssued }: {
  user: UserRow | null; roles: RoleRow[]; onClose: () => void; onIssued: (email: string, password: string) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [roleIds, setRoleIds] = useState<string[]>(user?.roles.map((r) => r.id) ?? []);

  const save = useMutation({
    mutationFn: () => user
      ? apiSend("PATCH", `/users/${user.id}`, { name, roleIds })
      : apiSend<{ temporaryPassword: string | null }>("POST", "/users", { email, name, roleIds }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(user ? `${name} updated` : `${email} created`);
      const pw = (r as { temporaryPassword?: string | null } | undefined)?.temporaryPassword;
      onClose();
      if (pw) onIssued(email, pw);
    },
  });

  const toggle = (id: string) => setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>You can only assign roles whose permissions you hold yourself.</DialogDescription>
        </DialogHeader>
        {!user && (
          <label><span className={label}>Email</span>
            <input className={inputSm} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        <label><span className={label}>Name</span>
          <input className={inputSm} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset>
          <legend className={label}>Roles</legend>
          <div className="grid grid-cols-2 gap-1">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggle(r.id)} /> {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorNote error={save.error} />
        <DialogFooter>
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!name.trim() || (!user && !email.trim()) || roleIds.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : user ? "Save" : "Create user"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersRoles() {
  const { can, user: me } = useSession();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => apiGet<UserRow[]>("/users"), enabled: can("user:read") });
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: () => apiGet<RoleRow[]>("/roles"), enabled: can("role:read") });
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const act = useMutation({
    mutationFn: ({ u, action }: { u: UserRow; action: "activate" | "deactivate" | "reset" | "unlock" }) =>
      action === "reset"
        ? apiSend<{ temporaryPassword: string | null }>("POST", `/users/${u.id}/reset-password`, {})
        : action === "unlock"
          ? apiSend("POST", `/users/${u.id}/unlock`)
          : apiSend("PATCH", `/users/${u.id}`, { isActive: action === "activate" }),
    onSuccess: (r, { u, action }) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`${u.name} ${DONE[action]}`);
      const pw = (r as { temporaryPassword?: string | null } | undefined)?.temporaryPassword;
      if (pw) setIssued({ email: u.email, password: pw });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!can("user:read")) {
    return (
      <div className="px-6 py-5">
        <PageHeader title="Users & roles" />
        <EmptyState title="Not available" description="You need the user:read permission to manage users." />
      </div>
    );
  }

  const columns: Column<UserRow>[] = [
    { key: "name", header: "Name", value: (u) => u.name, cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: "email", header: "Email", value: (u) => u.email, cell: (u) => <span className="text-muted-foreground">{u.email}</span> },
    { key: "roles", header: "Roles", value: (u) => u.roles.map((r) => r.name).join(", "), cell: (u) => u.roles.map((r) => r.name).join(", ") },
    { key: "lastLogin", header: "Last sign-in", width: "w-[180px]", value: (u) => u.lastLoginAt ?? "", cell: (u) => <span className="whitespace-nowrap">{fmt(u.lastLoginAt)}</span> },
    {
      key: "status", header: "Status", width: "w-[150px]", value: (u) => (u.isActive ? (u.locked ? "Locked" : "Active") : "Inactive"),
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={u.isActive ? (u.locked ? "amber" : "green") : "gray"} label={u.isActive ? (u.locked ? "Locked" : "Active") : "Inactive"} />
          {u.mustChangePassword && <StatusBadge status="blue" label="Temp password" />}
        </span>
      ),
    },
    ...(can("user:update") ? [{
      key: "actions", header: "", width: "w-[280px]", value: () => "",
      cell: (u: UserRow) => (
        <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          <button className={btnGhostSm} onClick={() => setEditing(u)}>Edit</button>
          {u.id !== me.id && <button className={btnGhostSm} disabled={act.isPending} onClick={() => act.mutate({ u, action: "reset" })}>Reset password</button>}
          {u.locked && <button className={btnGhostSm} onClick={() => act.mutate({ u, action: "unlock" })}>Unlock</button>}
          {u.id !== me.id && (u.isActive
            ? <button className={`${btnGhostSm} text-danger`} onClick={() => act.mutate({ u, action: "deactivate" })}>Deactivate</button>
            : <button className={btnGhostSm} onClick={() => act.mutate({ u, action: "activate" })}>Reactivate</button>)}
        </span>
      ),
    } satisfies Column<UserRow>] : []),
  ];

  const roleList = roles.data ?? [];
  return (
    <div className="px-6 py-5">
      <PageHeader
        title="Users & roles"
        description={users.data ? `${users.data.length} users across ${roleList.length} roles` : "Loading…"}
        actions={can("user:create") && roleList.length ? <button className={btnPrimary} onClick={() => setEditing("new")}>Add user</button> : undefined}
      />

      {can("role:read") && (
        <Section title="Roles" className="mb-8">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {roleList.map((r) => (
              <div key={r.id} className="border-t border-border pt-3">
                <dt className="flex items-center justify-between">
                  <span className="font-medium">{r.name} {r.isSystem && <span className="text-caption text-muted-foreground">(system)</span>}</span>
                  <span className="text-heading-sm tabular-nums text-foreground">{r.users}</span>
                </dt>
                <dd className="mt-1.5 text-body-sm text-muted-foreground">{r.description ?? `${r.permissions.length} permissions`}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Users">
        {users.error ? (
          <EmptyState title="Users could not be loaded" description={(users.error as Error).message}
            action={<button className={btnSecondary} onClick={() => void users.refetch()}>Try again</button>} />
        ) : (
          <DataTable
            columns={columns}
            rows={users.data ?? []}
            rowKey={(u) => u.id}
            name="Users"
            loading={users.isPending}
            searchable
            exportable
            empty={<EmptyState title="No users" description="No accounts match this view." />}
          />
        )}
      </Section>

      {editing && (
        <UserDialog user={editing === "new" ? null : editing} roles={roleList} onClose={() => setEditing(null)}
          onIssued={(email, password) => setIssued({ email, password })} />
      )}
      {issued && <PasswordReveal {...issued} onClose={() => setIssued(null)} />}
      {act.error && <div className="mt-3"><ErrorNote error={act.error} /></div>}
    </div>
  );
}
