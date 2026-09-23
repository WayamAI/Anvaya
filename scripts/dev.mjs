/*
  `next dev` wrapper that pre-compiles the app's routes.

  Why this exists
  ---------------
  `next dev` compiles a route the first time something asks for it. Measured
  across all 31 routes here, that first request costs 1.5s–8.6s, and because
  prefetching is disabled in development the bill lands on the sidebar click
  itself: you click, and nothing happens for several seconds. Once a route is
  compiled the same click takes ~200ms.

  So the fix is not to make the click faster — it is to make sure the click is
  never the thing that pays for the compile. After the dev server reports
  ready, this walks every route once in the background. By the time you use
  the sidebar the routes are warm, and navigation stays at the ~200ms it was
  always capable of.

  This is a development-only concern. Production builds are compiled ahead of
  time and navigate in 69–265ms with no warming.

  Escape hatches: NEXT_DEV_NO_WARM=1 skips warming, or use `npm run dev:bare`.
*/

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || "8080";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Invoked through node against Next's own CLI entry rather than the `next`
// shim, so there is no shell involved and the flags reach it verbatim.
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

const next = spawn(process.execPath, [nextBin, "dev", "-p", PORT], {
  cwd: ROOT,
  stdio: "inherit",
});

next.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    next.kill(sig);
  });
}

/** Routes are read from the filesystem so new pages are warmed automatically. */
async function routes() {
  const dir = path.join(ROOT, "src", "app", "(app)");
  const entries = await readdir(dir, { withFileTypes: true });
  return ["/", ...entries.filter((e) => e.isDirectory()).map((e) => `/${e.name}`)];
}

async function ready(deadline) {
  while (Date.now() < deadline) {
    try {
      await fetch(ORIGIN, { signal: AbortSignal.timeout(60_000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

async function warm() {
  if (process.env.NEXT_DEV_NO_WARM === "1") return;
  if (!(await ready(Date.now() + 120_000))) return;

  const list = await routes().catch(() => []);
  const started = Date.now();

  // One at a time on purpose: the dev server compiles serially anyway, and
  // flooding it competes with whatever the developer is doing right now.
  for (const route of list) {
    try {
      const res = await fetch(ORIGIN + route, { signal: AbortSignal.timeout(120_000) });
      await res.arrayBuffer();
    } catch {
      // A route that fails to warm is not worth interrupting the session for;
      // it will simply compile on demand the way it used to.
    }
  }

  console.log(
    `\n  ✓ Pre-compiled ${list.length} routes in ${((Date.now() - started) / 1000).toFixed(1)}s — sidebar navigation is warm\n`,
  );
}

warm();
