import { describe, it, expect } from "vitest";
import { securityHeaders } from "./security-headers.mjs";

const asMap = (h: { key: string; value: string }[]) => Object.fromEntries(h.map((x) => [x.key, x.value]));
const directives = (csp: string) => Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values];
}));

describe("securityHeaders", () => {
  const prod = asMap(securityHeaders({ production: true, appUrl: "https://plan.acme.example" }));
  const dev = asMap(securityHeaders({ production: false, appUrl: "http://localhost:8080" }));

  it("refuses framing, sniffing and cross-origin referrers everywhere", () => {
    for (const h of [prod, dev]) {
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
      expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(directives(h["Content-Security-Policy"])["frame-ancestors"]).toEqual(["'none'"]);
    }
  });

  it("keeps production scripts, connections and objects to this origin", () => {
    const csp = directives(prod["Content-Security-Policy"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    // The wordmark face, and nothing else, comes from Google Fonts.
    expect(csp["font-src"]).toContain("https://fonts.gstatic.com");
    expect(csp["style-src"]).toContain("https://fonts.googleapis.com");
  });

  it("pins HTTPS only for production served over HTTPS", () => {
    expect(prod["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(directives(prod["Content-Security-Policy"])).toHaveProperty("upgrade-insecure-requests");
    const plainHttp = asMap(securityHeaders({ production: true, appUrl: "http://localhost:8080" }));
    expect(plainHttp["Strict-Transport-Security"]).toBeUndefined();
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });

  it("allows what the development server needs, and only there", () => {
    const csp = directives(dev["Content-Security-Policy"]);
    expect(csp["script-src"]).toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toEqual(expect.arrayContaining(["'self'", "ws:"]));
  });
});
