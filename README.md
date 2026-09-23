# Anvaya — Production Planning

A material planning & production ERP dashboard: MRP runs, BOM management, inventory, purchasing, demand forecasting, and analytics, all in one app.

**Live:** https://production-planning-six.vercel.app

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [React Router](https://reactrouter.com/) for routing
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) for UI
- [TanStack Query](https://tanstack.com/query) for data/state
- [Recharts](https://recharts.org/) for charts
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) for unit tests, [Playwright](https://playwright.dev/) for e2e

## Getting started

Requires Node.js 18+ and npm (or bun, since the repo also ships a `bun.lock`).

```bash
npm install
npm run dev       # start the dev server at http://localhost:8080
```

Other scripts:

```bash
npm run build      # production build -> dist/
npm run build:dev   # development-mode build
npm run preview     # preview the production build locally
npm run lint         # eslint
npm run test          # run unit tests once
npm run test:watch    # run unit tests in watch mode
```

## Project structure

```
src/
  assets/         Anvaya logos and other static assets
  components/
    auth/          Route guard (RequireAuth)
    layout/        AppLayout, AppHeader, AppSidebar
    ui/             shadcn/ui components
  pages/           One file per route/screen (Dashboard, MRPRun, BOMManagement, ...)
  App.tsx          Route table
public/            Static files served as-is (favicon, robots.txt, docs)
```

## Authentication

This is a demo environment: the `/login` screen accepts **any email and any password** — there is no backend credential check. Signing in sets a `matrixops_auth` flag in `localStorage`; every other route is guarded by `RequireAuth` (`src/components/auth/RequireAuth.tsx`) and redirects back to `/login` if that flag isn't set. Use the sign-out icon in the header to clear it.

## Deploying on Vercel

The repo includes a `vercel.json` that pins the framework and build settings explicitly, so a fresh Vercel project (or one previously configured for a different framework) will build correctly without manual dashboard changes:

```json
{
  "framework": "vite",
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- `buildCommand` / `outputDirectory` match Vite's defaults.
- The catch-all rewrite to `/index.html` is required because this is a client-side-routed SPA (React Router) — without it, refreshing or deep-linking to any route other than `/` returns a 404.
- No environment variables are required to build or run the app.

To deploy:

```bash
vercel link      # first time only, link to a Vercel project
vercel deploy --prod
```

Or connect the GitHub repo directly in the Vercel dashboard — the `vercel.json` settings are picked up automatically, no manual framework/build configuration needed.
