"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import { ArrowRight } from "lucide-react";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
import { btnPrimary, inputBase } from "@/components/app/controls";

export default function Login() {
  const router = useRouter();
  const { theme = "light" } = useTheme();
  const anvayaLogo = (theme === "dark" ? anvayaLogoDark : anvayaLogoLight).src;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Demo auth: any email + any password is accepted — no credential check.
  const handleLogin = () => {
    localStorage.setItem("matrixops_auth", "true");
    localStorage.setItem("matrixops_email", email || "guest@anvaya.in");
    localStorage.setItem("matrixops_role", "admin");
    router.push("/");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
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

            <button type="submit" className={`${btnPrimary} h-10 w-full`}>
              Sign in <ArrowRight />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
