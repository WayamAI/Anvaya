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
  */
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 50,
  },
  eslint: {
    // Linting is run explicitly via `npm run lint`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
