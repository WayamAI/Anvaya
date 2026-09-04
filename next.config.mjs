/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is run explicitly via `npm run lint`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
