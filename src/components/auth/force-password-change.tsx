"use client";

import { useState } from "react";
import { btnPrimary, inputBase } from "@/components/app/controls";
import { ErrorNote } from "@/components/app/api-error-note";
import { apiSend } from "@/lib/api";

/**
 * Shown instead of the app while the user holds an administrator-issued
 * password. The server refuses every other request until it is replaced, so
 * this is the only thing the user can usefully do.
 */
export function ForcePasswordChange({ name, onDone }: { name: string; onDone: () => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== newPassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", "/auth/change-password", { currentPassword, newPassword });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="surface-panel w-full max-w-sm space-y-3 p-6">
        <h1 className="text-body-lg font-semibold">Set your own password</h1>
        <p className="text-body-sm text-muted-foreground">
          {name}, your password was set by an administrator. Choose a new one to continue: at least 12 characters, with upper and
          lower case letters and a number.
        </p>
        <label className="block">
          <span className="mb-1 block text-caption text-muted-foreground">Current (temporary) password</span>
          <input className={inputBase} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-muted-foreground">New password</span>
          <input className={inputBase} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={12} />
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-muted-foreground">Confirm new password</span>
          <input className={inputBase} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {mismatch && <p className="text-body-sm text-danger">The passwords do not match.</p>}
        <ErrorNote error={error} />
        <button className={`${btnPrimary} w-full`} type="submit" disabled={busy || mismatch || !newPassword || !currentPassword}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </main>
  );
}
