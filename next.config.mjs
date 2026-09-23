/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
    Dev-server route cache.

    `next dev` compiles routes on demand and, by default, keeps only the last
    five of them alive for 60s. This app has thirty-one routes, so ordinary
    navigation evicts pages faster than you revisit them and each return trip
    pays a full recompile — measured at 3.4s to 5s per route here, and ~22s for
    the very first. During that window a sidebar click looks like it did
    nothing, which reads as a dropped click rather than a slow one.

    Holding every route in memory for the session removes the recompile on all
    but the first visit. This affects `next dev` only; production builds are
    compiled ahead of time and ignore it.

    This only removes *repeat* compiles. The first visit to a route still costs
    one, and with prefetching disabled in dev that cost lands on the sidebar
    click. `scripts/dev.mjs` (what `npm run dev` runs) closes that gap by
    walking every route once after startup, so clicks never pay for a compile.
  */
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 50,
  },
  eslint: {
    // Linting is run explicitly via `npm run lint`.
    ignoreDuringBuilds: true,
  },

  experimental: {
    /*
      Left out of the server bundle and required at runtime instead.

      pino sends pretty-printing to a worker thread, which it starts by
      resolving "pino-pretty" by name. Once webpack has bundled pino that
      name no longer resolves from inside the bundle, the worker fails to
      start, and every log line is silently dropped — the app looks fine and
      logs nothing.

      Prisma is here for the same class of reason: it loads its query engine
      binary relative to its own package directory, and @node-rs/argon2 ships
      a compiled .node addon that webpack cannot parse as JavaScript at all.
    */
    serverComponentsExternalPackages: [
      "pino",
      "pino-pretty",
      "@prisma/client",
      "@prisma/adapter-pg",
      "@node-rs/argon2",
    ],
  },
};

export default nextConfig;
