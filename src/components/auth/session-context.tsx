"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * The signed-in user, shared with the tree below the route guard.
 *
 * The permission list here decides what the UI *offers*. It never decides
 * what is *allowed* — the server checks the same permissions on every
 * request, so a user who edits this state in devtools gets buttons that
 * return 403.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  companyId: string;
  roles: string[];
  permissions: string[];
  /** Set while the user holds an administrator-issued password. */
  mustChangePassword?: boolean;
}

interface SessionValue {
  user: SessionUser;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const value = useMemo<SessionValue>(() => {
    const held = new Set(user.permissions);
    return {
      user,
      can: (permission) => held.has(permission),
      canAny: (permissions) => permissions.some((p) => held.has(p)),
    };
  }, [user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Throws outside the provider, which means the tree escaped the route guard. */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside RequireAuth");
  return ctx;
}

/** For components that may render on public pages too. */
export function useOptionalSession(): SessionValue | null {
  return useContext(SessionContext);
}
