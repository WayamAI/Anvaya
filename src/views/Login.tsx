"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowRight } from "lucide-react";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
import { btnPrimary, inputBase } from "@/components/app/controls";

/** The company code is not a secret; remembering it saves retyping it on a shared terminal. */
const COMPANY_KEY = "anvaya-company-code";

export default function Login() {
  const router = useRouter();
  const { theme = "light" } = useTheme();
  const anvayaLogo = (theme === "dark" ? anvayaLogoDark : anvayaLogoLight).src;
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      setCompany(localStorage.getItem(COMPANY_KEY) ?? "");
    } catch {
      // Storage may be unavailable (private mode); the field just starts empty.
    }
  }, []);

  /*
    Credentials are checked by the server. The session arrives as an httpOnly
    cookie, which no script on this page can read — so there is nothing to put
    in localStorage, and nothing for a cross-site script to steal.

    `router.refresh()` before navigating discards the cached tree rendered for
    a signed-out visitor; without it the shell can reappear from cache still
    believing nobody is signed in.
  */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, email, password }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error?.message ?? "Sign in failed. Please try again.");
        return;
      }

      try {
        localStorage.setItem(COMPANY_KEY, company.trim().toUpperCase());
      } catch {
        // Not remembering the code is harmless.
      }

      /*
        Return the user to wherever they were headed. The destination comes
        from the middleware's `from` query parameter, or from the route
        guard's sessionStorage note. Only same-origin paths are accepted: a
        value like "//evil.example" would otherwise redirect off-site.
      */
      const raw = new URLSearchParams(window.location.search).get("from")
        ?? sessionStorage.getItem("anvaya_from");
      sessionStorage.removeItem("anvaya_from");
      const safe = raw && raw.startsWith("/") && !raw.startsWith("//") && raw !== "/login" ? raw : "/";

      router.refresh();
      router.replace(safe);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 text-center">
          {/* The lockup is 4.5:1 and cropped to its own artwork, so 48px of
              height comes out ~216px wide — a little over half the 380px
              column, which sits over the form without crowding it. */}
          <img src={anvayaLogo} alt="Anvaya" className="mx-auto block h-12 w-auto object-contain" />
          {/*
            The one Michroma setting in the product. It is the wordmark, so it
            gets the display face; nothing below it does.
          */}
          <p className="font-brand mt-5 text-body-sm text-muted-foreground">
            Production planning
          </p>
        </div>

        <form onSubmit={handleSubmit} className="surface-panel p-6">
          <div className="space-y-4">
            {/* Several companies share Anvaya and an email can belong to more
                than one of them, so the company is always named, never guessed. */}
            <div>
              <label htmlFor="login-company" className="mb-1.5 block text-label-sm text-foreground">
                Company code
              </label>
              <input
                id="login-company"
                autoComplete="organization"
                autoCapitalize="characters"
                spellCheck={false}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. ACME"
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-label-sm text-foreground">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-label-sm text-foreground">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputBase}
              />
            </div>

            {/* Sign-in failures are reported here rather than as a toast: the
                message belongs next to the fields it refers to, and a screen
                reader should hear it when it appears. */}
            {error && (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`${btnPrimary} h-10 w-full disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {submitting ? "Signing in…" : "Sign in"} <ArrowRight />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
