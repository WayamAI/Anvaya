/**
 * HTTP security headers for every response, applied by next.config.mjs.
 *
 * Plain JavaScript because next.config.mjs imports it before TypeScript is
 * involved. The CSP has to admit 'unsafe-inline' scripts and styles: the App
 * Router bootstraps with inline scripts, and next-themes and the charts set
 * inline styles. Narrowing that needs per-request nonces from middleware, a
 * larger change. Everything else is held to this origin; framing is refused
 * outright, since every screen is a target for clickjacking a write.
 *
 * @param {{ production: boolean; appUrl: string }} opts
 * @returns {{ key: string; value: string }[]}
 */
export function securityHeaders({ production, appUrl }) {
  const https = appUrl.startsWith("https://");
  const csp = [
    "default-src 'self'",
    // Development adds eval for fast refresh's source maps.
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    // Development adds the hot-reload websocket.
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(production && https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    // For browsers that predate frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // Only where the site really is served over HTTPS; on plain HTTP it would
    // be ignored at best, and pin a local test host at worst.
    ...(production && https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}
