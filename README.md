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

Requires Node.js 20+ and Docker Desktop (running) for the local database.

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET and SEED_USER_PASSWORD (see below)
npm run db:up                 # Postgres 16 on localhost:55432
npm run db:deploy             # apply migrations
npm run db:seed               # demo company, users, master data, open orders
npm run dev                   # http://localhost:8080
```

Sign in with company code `ANVAYA` as any seeded user (see
[Demo roles](#demo-roles)) with the `SEED_USER_PASSWORD` you set. Companies
share the database and an email is unique only within one, so sign-in always
names the company.

### Environment variables

Every variable is validated at startup (`src/server/config/env.ts`); a missing
or malformed value stops the server with a readable message. `.env.example`
documents each one. `.env` is git-ignored — never commit it.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. The example matches `docker-compose.yml` (port 55432). |
| `DATABASE_POOL_MAX` | no (10) | Connections per server instance; 2–5 on serverless hosts. |
| `NODE_ENV` | yes | `development` locally, `production` when deployed. |
| `APP_URL` | no (`http://localhost:8080`) | The app's public origin; used for same-origin checks. |
| `AUTH_SECRET` | yes | At least 32 characters. Generate your own: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `SESSION_MAX_AGE_SECONDS` | no (8 h) | Session idle timeout. |
| `SESSION_ABSOLUTE_MAX_SECONDS` | no (24 h) | Session hard limit after sign-in. |
| `LOG_LEVEL`, `LOG_PRETTY` | no | pino log level and terminal formatting. |
| `SEED_USER_PASSWORD` | for seeding | Password given to every seeded demo user. Choose your own; local demo data only. |
| `PLANNING_AS_OF_DATE` | no — leave blank | Pins the planning date for a fixed-date demo (see below). Refused in production. |
| `SEED_AS_OF_DATE` | no — seed only | Seeds the demo for a given day instead of today. |

### Database and demo data

| Command | Effect |
| --- | --- |
| `npm run db:up` / `db:down` | Start / stop the local Postgres container (data is kept in a Docker volume). |
| `npm run db:deploy` | Apply pending migrations. |
| `npm run db:seed` | Load the demo data (idempotent on an empty or already-seeded database). |
| `npm run db:reset` | **Drop the local database**, re-apply every migration and re-run the seed. Use it before each demo. |

The demo seed refuses `NODE_ENV=production` and any database not on this
machine; seeding a staging database needs `ANVAYA_ALLOW_DEMO_SEED` (the seed
prints the exact value when it refuses).

**Demo date.** The demo data is written around 2026-03-25 and the seed rebases
it onto the day it runs (India time): every date moves by the same number of
days, and forecast months move by whole months. Open orders, receipts and
forecasts therefore sit around today, and the app runs on the real clock —
orders, receipts and MRP runs made during a demo line up with the seeded ones.
Because of that, **seed on the day you present**: data seeded on an earlier
day ages, and its orders start to show as overdue. To reproduce a fixed demo
instead, seed with `SEED_AS_OF_DATE` and pin `PLANNING_AS_OF_DATE` to the same
day (refused in production; writes still use the real date, so a pinned demo
cannot mix in live entries).

**What the seed contains.** One company (`ANVAYA`), four locations, 26
materials with stocking policies, 10 vendors with price lists, 6 customers,
active BOMs for FG-001 and SA-101, stock and lots, open purchase, sales and work
orders, and monthly demand forecasts. Every batch-tracked balance is held in
released lots (stock with no recorded lot gets an `OPN-…` opening lot), so it
can be issued and dispatched. **No MRP run is seeded** — the planning screens
read "No MRP run yet" until a planner runs MRP.

### Demo roles

All users are `<role>@anvaya.in` in company `ANVAYA`, with `SEED_USER_PASSWORD`.
Menus show only the screens a role can read, and every action is checked again
on the server.

| User | Role | Can do in the demo flow |
| --- | --- | --- |
| `admin@` | Administrator | Everything, including users, roles and settings |
| `planner@` | Production Planner | Book sales orders, run MRP, convert planned **production** into work orders, manage BOMs and work orders |
| `procurement@` | Procurement | Convert planned **purchases** into draft POs, approve and send POs, receive goods, manage vendors |
| `production@` | Production | Firm, release, issue, report output on and complete work orders |
| `inventory@` | Inventory Controller | Receive goods, release / hold / reject lots (quality), adjust stock, dispatch sales orders |
| `viewer@` | Viewer | Read-only across the product |

Five failed sign-ins lock an account; an administrator unlocks it under
**Users & roles**.

## Demo guide

A 5–10 minute run of the core flow, each step by the role that owns it. Reset
first (`npm run db:reset`), start `npm run dev`, and give it a minute after
"Ready" so the background pre-compile warms every route.

1. **Dashboard** (`admin@`) — figures from every area; planning panels read
   "No MRP run yet".
2. **Sales order intake** (`planner@`) — *New sales order*: a customer, ship
   from Pune Plant, required in two to three weeks, product **FG-001**
   (it has an active BOM). *Book order*.
3. **MRP run & results** (`planner@`) — *Run MRP now*. Show planned orders, the
   new sales order in the *For* column, *Exceptions*, and *Pegging* (click a
   row). Search FG-001, tick the row for the new order, *Convert 1 to orders*
   → a work order.
4. **Material requirements** and **Material coverage** — the time-phased
   record (click a row), days of cover, order-by dates.
5. **Purchase planning** (`procurement@`) — tick a "This week" line,
   *Create draft POs*.
6. **Purchase orders** (`procurement@`) — open the draft: *Approve*, then
   *Mark sent to vendor*.
7. **Purchase orders** (`inventory@`) — same PO: *Receive goods* → *Post
   receipt*. A batch-tracked line gets a new lot, pending quality.
8. **Batch & serial tracking** (`inventory@`) — search the new lot, *QC
   report* → *Release*, enter a CoA reference, *Confirm release*.
9. **Work orders** (`production@`) — open the work order from step 3:
   *Release*, then *Issue materials* (see limitations).
10. **Dashboard** — the new orders, receipt and plan are reflected.

### Demo limitations

- **CoA required.** Releasing a *purchased* lot needs a certificate of
  analysis reference; the release is refused without one.
- **Genuine shortages.** The seed is short of some components on purpose
  (e.g. RM-8012 Fragrance Blend, SA-101 Concentrate Base), which is what MRP
  plans around. Issuing a full FG-001 work order is refused for those lines,
  with the available quantity named. Issue smaller quantities or only the
  components in stock, or receive the shortfall first.
- **Products without a BOM.** FG-002 to FG-005 have no active BOM: MRP plans
  them and raises a *Missing BOM* exception, but their rows cannot be converted
  into work orders (marked "No BOM").
- **Issues are all or nothing.** If any line is short, nothing is issued.
- **Conversion is split by role.** Planners convert production, procurement
  converts purchases; only an administrator can do both.
- **Unfinished screens are not offered.** Forecasting, analytics and report,
  integration and alert-configuration screens are out of the menu and answer
  404 until they are built.
- **First clicks in dev mode.** `next dev` compiles a screen the first time
  it opens; let the pre-compile finish before presenting.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server, pre-compiling routes in the background |
| `npm run build` / `start` | Production build and server (they run as production, which refuses a pinned `PLANNING_AS_OF_DATE`: blank it for a local build, `PLANNING_AS_OF_DATE= npm run build`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit and route tests (no database needed) |
| `npm run test:integration` | Write-side tests against the Postgres in `DATABASE_URL` |
| `npm run db:migrate` | Create a migration from schema changes (development) |
| `npm run db:deploy` | Apply pending migrations (production and CI) |
| `npm run db:seed` / `db:reset` | Seed demo data / drop the local database, migrate and seed |
| `npm run db:up` / `db:down` | Start / stop the local Postgres container |

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
   `LOG_PRETTY=false`. Do **not** set `PLANNING_AS_OF_DATE`: the server
   refuses to start in production when it is set. MRP planning runs always
   plan from today; another date requires `"simulation": true`, and a
   simulation is never the latest plan and cannot be converted into orders.
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
