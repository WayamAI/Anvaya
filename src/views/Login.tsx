"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import { ArrowRight } from "lucide-react";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="w-full max-w-md animate-scale-in">
        <div className="text-center mb-8">
          <img src={anvayaLogo} alt="Anvaya" className="h-28 object-contain mx-auto" />
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 shadow-lg shadow-primary/5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              className="w-full h-10 bg-accent text-accent-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
