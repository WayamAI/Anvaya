# Anvaya — Production Planning

A material planning and production ERP for process manufacturers: purchasing
and goods receipt into lots, quality release, sales order dispatch, work
orders with component issue and output, stock counts, BOMs, master data, and
lot traceability both ways — on a Postgres stock ledger with an audit trail.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18 + TypeScript
- PostgreSQL 16 via [Prisma 7](https://www.prisma.io/) (driver adapter `@prisma/adapter-pg`)
- Tailwind CSS + shadcn/ui, TanStack Query, Recharts
- Zod validation, argon2 password hashing, pino logging
- Vitest (unit, route and integration tests), Playwright configured for e2e

## Getting started

Requires Node.js 20+ and Docker (for the local database).

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET and SEED_USER_PASSWORD
npm run db:up                 # Postgres 16 on localhost:55432
npm run db:deploy             # apply migrations
npm run db:seed               # demo company, users, master data, open orders
npm run dev                   # http://localhost:8080
```

Sign in as any seeded user — `admin@`, `planner@`, `procurement@`,
`production@`, `inventory@` or `viewer@anvaya.in` — with the
`SEED_USER_PASSWORD` you set. Each has the permissions of its role.

The demo data is arranged around 2026-03-25; `.env.example` pins
`PLANNING_AS_OF_DATE` to it so the read screens look as intended. Leave it
unset in production. Writes (receipts, dispatches, output) always use the
real date in the company's time zone.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server, pre-compiling routes in the background |
| `npm run build` / `start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit and route tests (no database needed) |
| `npm run test:integration` | Write-side tests against the Postgres in `DATABASE_URL` |
| `npm run db:migrate` | Create a migration from schema changes (development) |
| `npm run db:deploy` | Apply pending migrations (production and CI) |
| `npm run db:seed` / `db:reset` | Seed demo data / drop, migrate and seed |

## Architecture

```
src/
  app/api/v1/        Route handlers: validate, authorise, call a service
  server/
    api/             withApi wrapper, idempotency, rate limiting, responses
    auth/            Sessions, passwords, RBAC
    services/        Database access and transactions, one file per area
    purchasing/ sales/ production/ inventory/
                     Business rules as pure functions, unit-tested
    validation/      Zod request schemas
    db/              Prisma client, transactions and row locks, numbering
  views/             Screens; components/ shared UI and action dialogs
prisma/              Schema, migrations, seed
docs/api.md          API reference and the business rules behind it
```

Every stock change is a signed movement in one ledger service, inside a
transaction that locks the rows it touches; balances, lots and valuation
follow from it. See **Writes** in `docs/api.md` for the guarantees (no
negative stock, idempotent retries, gap-free numbering, audit in the same
commit).

## Authentication

Real accounts with argon2-hashed passwords and server-side sessions in an
httpOnly cookie. Permissions come from roles held in the database and are
checked on every request. Accounts lock after 5 failed sign-ins; sign-in is
also rate limited per address and per account. Administrator-issued
passwords must be changed at first sign-in.

## Deploying

The app is a standard Next.js server and needs a PostgreSQL 16 database.

**Vercel** (`vercel.json` is set up for Next.js):

1. Create a managed Postgres (Neon, Supabase, RDS…). Use its **pooled**
   connection string for `DATABASE_URL`, and set `DATABASE_POOL_MAX` to 2–5 —
   every serverless instance opens its own pool.
2. Set the environment: `DATABASE_URL`, `DATABASE_POOL_MAX`, `AUTH_SECRET`
   (32+ random bytes), `APP_URL`, `NODE_ENV=production`, `LOG_LEVEL=info`,
   `LOG_PRETTY=false`. Do **not** set `PLANNING_AS_OF_DATE`.
3. Apply migrations as a release step, before or alongside each deploy:
   `DATABASE_URL=… npx prisma migrate deploy`. The build does not migrate, so
   a preview deployment can never alter the production schema.
4. Create the first company and administrator (the demo seed is for local
   and staging use only):
   ```bash
   DATABASE_URL=… npm run company:create -- --code ACME --name "Acme Chemicals"      --admin-email ops@acme.in --admin-name "Asha Rao"
   ```
   It prints a one-time temporary password; the administrator sets their own
   at first sign-in and creates everything else in the app.

`GET /api/v1/health` checks the database round-trip and answers 500 when it
cannot, for uptime monitoring and deploy checks.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: typecheck,
lint, unit and route tests, a production build, and the integration suite
against a fresh Postgres with every migration applied from scratch.
