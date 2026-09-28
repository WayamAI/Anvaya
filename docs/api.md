# Anvaya API

Base path: `/api/v1`

Every endpoint is built from `withApi()` (`src/server/api/with-api.ts`), which
owns request ids, timing, logging and the single translation point from thrown
errors to HTTP responses. Route handlers stay thin: validate, authorize, call a
service, return.

## Response envelope

Success:

```json
{ "data": { ... }, "meta": { "nextCursor": "...", "limit": 50, "total": 128 } }
```

`meta` is present only on collection endpoints.

Failure:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The submitted data is invalid",
    "details": [{ "path": "quantity", "message": "must be greater than 0" }],
    "requestId": "0d7263bc-162f-4d2d-bf72-2196d4ff3f58"
  }
}
```

`details` appears for field-level failures. `requestId` matches the
`x-request-id` response header and the server log line, so a report from a user
can be traced to the exact request.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | Input failed schema validation |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but lacking the permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate business key, or invalid FK reference |
| `UNPROCESSABLE` | 422 | Well-formed but rejected by a domain rule (e.g. a BOM cycle) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Unexpected failure — details are logged, never returned in production |

Prisma constraint violations are translated automatically: `P2002` → 409 with
the offending field, `P2003` → 409, `P2025` → 404. A unique-constraint breach
is a business outcome, not a server fault, so it never surfaces as a 500.

## Request ids

Send `x-request-id` to correlate a client action with server logs; one is
generated when absent. It is always echoed in the response header.

## Conventions

- Resources are plural nouns: `/api/v1/materials`, `/api/v1/purchase-orders`.
- Verbs only for genuine actions on a resource:
  `POST /api/v1/mrp/runs/:id/execute`.
- `GET` list, `GET /:id` read, `POST` create (201 + `Location`), `PATCH`
  partial update, `DELETE` (204).
- Collections support `?limit=`, `?cursor=`, `?sort=-createdAt`,
  `?filter[status]=OPEN`, `?q=` search.

## Endpoints

### Implemented

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | none | Liveness and readiness, including a database round-trip |
| `POST` | `/api/v1/auth/login` | none | Exchange credentials for a session cookie |
| `POST` | `/api/v1/auth/logout` | optional | Revoke the current session |
| `GET` | `/api/v1/auth/me` | session | Current user and effective permissions |
| `POST` | `/api/v1/auth/change-password` | session | Rotate password; revokes all other sessions |
| `GET` | `/api/v1/auth/sessions` | session | The caller's own active sessions |
| `DELETE` | `/api/v1/auth/sessions` | session | Sign out everywhere |
| `GET` | `/api/v1/audit` | `audit:read` | Company audit trail, newest first, cursor-paged |
| `GET` | `/api/v1/materials` | `material:read` | Item master, by code, cursor-paged. `?q=` `?kind=` `?categoryId=` `?active=true\|false\|all` |
| `GET` | `/api/v1/materials/:id` | `material:read` | One material with category, unit, per-location policies and balances |
| `GET` | `/api/v1/material-categories` | `material:read` | All categories, parents included |
| `GET` | `/api/v1/units` | `material:read` | Units of measure with their dimension |
| `GET` | `/api/v1/locations` | `location:read` | Plants first, then setup order. `?active=true\|false\|all` |
| `GET` | `/api/v1/inventory/stock-overview` | `inventory:read` | Stock per material and location, thresholds, value, status and summary. `?locationId=` |
| `GET` | `/api/v1/inventory/health` | `inventory:read` | Health scores, per-material issues, recommendations, value by location and category. Built on the stock overview |
| `GET` | `/api/v1/inventory/exhaustion-alerts` | `inventory:read` | Material-locations with ≤ 14 days of cover: run-out date, reorder-by date, lead time, vendor |
| `GET` | `/api/v1/inventory/safety-stock` | `inventory:read` | Each policy's current vs recommended safety stock, with the inputs used |
| `GET` | `/api/v1/inventory/lots` | `inventory:read` | Lot register, newest first, cursor-paged. `?q=` `?qcStatus=` `?kind=` `?locationId=` |
| `GET` | `/api/v1/inventory/lots/:id` | `inventory:read` | One lot with backward trace (receipt, or producing work order and its input lots) and forward trace (dispatches, work orders that used it) |
| `GET` | `/api/v1/inventory/lots/indicators` | `inventory:read` | Backward/forward trace completeness, containment count, lots expiring within 30 days |
| `GET` | `/api/v1/boms` | `bom:read` | Made products (finished, semi-finished, or with a BOM), each with its BOM summary or `bom: null` |
| `GET` | `/api/v1/boms/:id` | `bom:read` | Multi-level tree for the active version (or `?version=`), version history, materials-only cost roll-up |
| `GET` | `/api/v1/boms/components/:materialId` | `bom:read` | Stock, lead time, vendors and where-used; open PO lines and last price only with `purchase-order:read` |
| `GET` | `/api/v1/work-orders` | `work-order:read` | All work orders, newest planned start first, with counts per status and a derived overdue count |
| `GET` | `/api/v1/work-orders/:id` | `work-order:read` | Operations, components (lot, and stock readiness at the order's location while open), output lots |
| `GET` | `/api/v1/production/schedule` | `work-order:read` | Orders placed on their work centres for their planned days; overlaps, unit-matched capacity load, shortages, overdue, stored constraints (as recorded). Read-only |
| `GET` | `/api/v1/purchase-orders` | `purchase-order:read` | All POs, newest first, with counts per status and a derived overdue count. Read-only |
| `GET` | `/api/v1/purchase-orders/:id` | `purchase-order:read` | Lines (ordered, received, outstanding), goods receipts, created and approved by |
| `GET` | `/api/v1/goods-receipts/:grnNumber` | `purchase-order:read` | A receipt by number, its lines and lots, and lots later produced from them |
| `GET` | `/api/v1/vendors/:id` | `vendor:read` | Approved-supplier status, supplied materials, latest scorecard |
| `GET` | `/api/v1/sales-orders` | `sales-order:read` | All sales orders, newest first, with counts per status, a derived overdue count and headline figures, as of the planning date. Read-only |
| `GET` | `/api/v1/sales-orders/:id` | `sales-order:read` | Header, customer, lines (ordered, shipped, open), the lots each line shipped from, stock and open work orders for each line's material |
| `GET` | `/api/v1/vendors` | `vendor:read` | Vendors by code. `?q=` `?active=` `?materialId=` (suppliers of that material with price and lead time, preferred first) |
| `POST` | `/api/v1/purchase-orders` | `purchase-order:create` | Raise a DRAFT PO; number assigned by the server; line price defaults to the vendor's price on file |
| `PATCH` | `/api/v1/purchase-orders/:id` | `purchase-order:update` | Edit a DRAFT; `lines`, when sent, replaces every line |
| `DELETE` | `/api/v1/purchase-orders/:id` | `purchase-order:delete` | Delete a DRAFT (204) |
| `POST` | `/api/v1/purchase-orders/:id/approve` | `purchase-order:approve` | DRAFT → APPROVED; vendor must be active and on the ASL |
| `POST` | `/api/v1/purchase-orders/:id/send` | `purchase-order:update` | APPROVED → ORDERED |
| `POST` | `/api/v1/purchase-orders/:id/cancel` | `purchase-order:update` | `{ reason }`. Cancels the order, or the remainder of a partly received one |
| `POST` | `/api/v1/goods-receipts` | `goods-receipt:create` | Receive against a PO: GRN, lots, RECEIPT movements, PO progress. Honours `Idempotency-Key` |
| `POST` | `/api/v1/inventory/lots/:id/qc` | `inventory:update` | `{ status: APPROVED\|QUARANTINE\|REJECTED, coaReference?, reason? }` — release, hold or reject a lot |
| `GET` | `/api/v1/customers` | `customer:read` | Customers by code. `?q=` `?active=` |
| `POST` | `/api/v1/sales-orders` | `sales-order:create` | Book a CONFIRMED order; number assigned by the server |
| `PATCH` | `/api/v1/sales-orders/:id` | `sales-order:update` | Edit a CONFIRMED order that has shipped nothing |
| `POST` | `/api/v1/sales-orders/:id/cancel` | `sales-order:update` | `{ reason }`. Cancels the order, or the remainder after a partial dispatch |
| `POST` | `/api/v1/sales-orders/:id/dispatches` | `sales-order:dispatch` | Ship stock; batch-tracked lines from named lots or first-expiry-first-out. Honours `Idempotency-Key` |
| `POST` | `/api/v1/sales-orders/:id/deliver` | `sales-order:dispatch` | DISPATCHED → DELIVERED |
| `POST` | `/api/v1/work-orders` | `work-order:create` | Plan an order at a manufacturing location; components snapshotted from the active (or named) BOM version |
| `PATCH` | `/api/v1/work-orders/:id` | `work-order:update` | Re-plan a PLANNED/FIRMED order; new quantity or start re-takes the snapshot |
| `POST` | `/api/v1/work-orders/:id/firm` | `work-order:update` | PLANNED → FIRMED |
| `POST` | `/api/v1/work-orders/:id/release` | `work-order:update` | PLANNED/FIRMED → RELEASED |
| `POST` | `/api/v1/work-orders/:id/issues` | `work-order:update` | Issue components (named lots or first-expiry-first-out). Honours `Idempotency-Key` |
| `POST` | `/api/v1/work-orders/:id/output` | `work-order:update` | Report good output (new lot, at actual cost) and scrap; `complete: true` finishes. Honours `Idempotency-Key` |
| `POST` | `/api/v1/work-orders/:id/complete` | `work-order:update` | IN_PROGRESS → COMPLETED without more output |
| `POST` | `/api/v1/work-orders/:id/close` | `work-order:update` | COMPLETED → CLOSED |
| `POST` | `/api/v1/work-orders/:id/cancel` | `work-order:update` | `{ reason }`; only while nothing is issued or produced |
| `GET` | `/api/v1/users` | `user:read` | Users with roles, lock state and whether they hold a temporary password |
| `POST` | `/api/v1/users` | `user:create` | Create a user; a server-generated temporary password is returned once |
| `PATCH` | `/api/v1/users/:id` | `user:update` | Name, active flag, roles. Deactivation revokes every session |
| `POST` | `/api/v1/users/:id/reset-password` | `user:update` | Issue a temporary password, clear lock-out, revoke sessions |
| `POST` | `/api/v1/users/:id/unlock` | `user:update` | Clear a failed-sign-in lock-out |
| `GET` | `/api/v1/roles` | `role:read` | Roles with permissions and user counts |
| `POST` | `/api/v1/roles` | `role:create` | Custom role from permissions the caller holds |
| `PATCH` `DELETE` | `/api/v1/roles/:id` | `role:update` / `role:delete` | Custom roles only; a role in use cannot be deleted |
| `GET` | `/api/v1/permissions` | `role:read` | The permission catalogue |

All master-data and inventory reads are scoped to the caller's company. A
record in another company reads as 404, the same as a missing one.

### Decimal values

Quantity and money columns are `Decimal` in the database. Responses return them
as JSON **numbers** (`4200`, not `"4200.000000"`); a value that is absent is
`null`, never `0`. Server-side sums are done in Decimal before conversion
(`src/server/api/decimal.ts`), so totals carry no floating-point drift.

### Stock status

`GET /inventory/stock-overview` classifies each row by comparing on-hand stock
with the planning policy in scope (`src/server/inventory/stock-overview.ts`):

| Status | Rule |
| --- | --- |
| `critical` | on hand ≤ safety stock |
| `low` | safety stock < on hand ≤ reorder point |
| `adequate` | on hand > reorder point |
| `unplanned` | no active policy for the material in scope |

Across all locations, stock and thresholds are both summed. Dead stock is
on-hand stock whose balance has not moved for more than 90 days.

### Inventory health

`GET /inventory/health` scores the all-locations stock overview, so status,
value, days of cover and dead stock always match Stock Overview
(`src/server/inventory/health.ts`). Scores are 0–100; the target is 80.

| Measure | Rule |
| --- | --- |
| Stock availability | Planned materials above their reorder point ÷ planned materials |
| Turnover efficiency | Always `null` — needs consumption history the ledger does not hold |
| Excess & obsolescence | Share of stock value that has moved within 90 days |
| Overall | Mean of the measures that are not `null`; `basedOn` names them |
| Per material | Mean of availability (100 adequate / 50 low / 0 critical) and movement (0 dead / 100 moving), each only where it applies |

Recommendations list issues critical → low → dead → unplanned; shortages with
the least days of cover first, the rest by value at stake. Whether a shortage
calls for a purchase or a work order comes from the policy's `procurementType`.

### Replenishment: exhaustion alerts and safety stock

Both read stock and days of cover from the stock overview and share one lead
time rule (`src/server/inventory/exhaustion.ts`):

| Policy `procurementType` | Lead time |
| --- | --- |
| `BUY` | Chosen vendor's `VendorMaterial.leadTimeDays` + `safetyLeadTimeDays`. The vendor is the preferred one, or the only one; several with none preferred → no lead time |
| `MAKE` | `productionLeadTimeDays` + `safetyLeadTimeDays` |

**Alerts:** critical < 3 days of cover, high < 7, medium ≤ 14. Required by =
today + whole days of cover; reorder by = required by − lead time, `immediate`
when that is today or past. A location without a demand figure is counted in
`notAssessed`, never alerted.

**Safety stock:** recommended = Z × σ(daily demand) × √(lead time), rounded up
and never negative, where Z is the inverse normal of the policy's
`serviceLevel`. A missing σ, service level or lead time makes it `null` with
`unavailableReason`. Variability is σ ÷ mean: < 0.15 Low, < 0.30 Medium, else
High. "Below safety stock" uses Stock Overview's critical rule (on hand ≤
safety stock).

### Bills of material

A component's quantity is per `baseQuantity` of its parent; per-unit figures
divide (SA-101 lists 32 kg per 100 L → 0.32 kg/L). Gross = per-unit ×
(1 + scrap), the same rule the work-order snapshot uses. Sub-assemblies expand
with their own active version; a material reappearing beneath itself is
flagged `cycle` and not expanded. The materials cost roll-up is Σ gross ×
standard cost of the leaves — `null` if any is unknown — and excludes labour
and overhead, which are not modelled. Lead time uses the shared rule, from the
policy at the manufacturing location. Where-used follows active versions
upwards, direct and via sub-assemblies.

### Work orders

Statuses are the schema's own; **overdue** is derived — an order still open
(not COMPLETED, CLOSED or CANCELLED) whose planned end date is before today.
**Trace %** is components with a lot recorded ÷ components, shown only once
production has started (IN_PROGRESS, COMPLETED, CLOSED). **Readiness**, for
open orders only, compares each component's outstanding quantity
(required − issued) with on-hand stock at the order's location — the same
figure Stock Overview shows. Orders are judged independently: stock is not
allocated between them, and open supply is not netted.

### Purchase orders

**Open** POs are APPROVED, ORDERED or PARTIALLY_RECEIVED — the same set BOM
component details count as incoming (`src/server/purchasing/purchase-orders.ts`).
**Overdue** is an open PO with a line past its expected date and quantity still
outstanding. **Received %** is weighted by value — Σ(min(received, ordered) ×
price) ÷ Σ(ordered × price) — so a PO mixing kg and pieces has one meaningful
figure. **Delivered** is `actualDeliveryDate` when recorded, else the latest
goods receipt date, returned with `source: "RECEIPT"`. A missing approver is
returned as `null`, never filled in.

### Sales orders

Measured against the **planning as-of date**, 2026-03-25
(`src/server/config/as-of.ts`), the day the seeded data is arranged around —
not the wall clock. **Open** is anything not DELIVERED or CANCELLED.
**Overdue** is a CONFIRMED or PROCESSING order with a line past its required
date and quantity still to ship. **Due in next 7 days** counts orders awaiting
dispatch required from the as-of day through seven days after; overdue ones
are not "due". **Dispatched this month** values ISSUE movements against sales
order lines (quantity × line price) from the first of the month to the end of
the as-of day — `dispatchDate` is not relied on, since it is often
unrecorded. The schema has no priority, no "new" status and no dispatch
target, so none is shown. Stock and open work orders on the detail are for the
line's material at its location: a work order is not linked to a sales order,
so they are supply for the material, not production for the order.

### Production schedule

An order occupies every work centre on its route for its whole planned window,
in whole days — operations record no dates, so no sequence or time of day is
inferred. **Overlaps** are two orders on one work centre sharing a day.
**Capacity** is compared only where a CAPACITY constraint names the work centre
("Blending line BLEND-01"), is per day, and shares the order's unit; the load
is the order's quantity spread evenly over its days. Stored constraint
utilisation is shown **as recorded**, never recalculated. A shortage lists any
earlier open order at the same location that makes the short material, as a
note — planned production is not netted into readiness.

### Lot traceability

The schema has no column linking a lot to the work order that produced it or
the sales order it shipped against; the stock ledger carries both links:

| Link | Ledger row |
| --- | --- |
| lot ← work order | `PRODUCTION_RECEIPT` with the lot, `referenceType: "WORK_ORDER"`, `referenceId` = work order id |
| lot → sales order line | `ISSUE` with the lot, `referenceType: "SALES_ORDER_LINE"`, `referenceId` = line id |
| input lot → work order | `WorkOrderComponent.lotId` |

These references are not foreign keys, so the database cannot enforce them;
the services scope every lookup to the caller's company.

**Backward complete:** a purchased lot has a receipt with a CoA; a produced lot
has a lot recorded for every component, each with a receipt and CoA.
**Forward complete:** everything consumed from the lot is explained by ledger
outflows or quantities issued to work orders. Lots with nothing consumed are
left out, and both figures are `null` when there is nothing to measure.

## Writes

Every write is one database transaction: it commits whole or not at all,
and its audit entries commit with it. Rows that concurrent requests could
both change (the PO being received, the stock balance being posted to) are
locked `FOR UPDATE` first, so concurrent requests serialise instead of
reading stale values. A deadlock is retried up to three times.

State-changing requests whose `Origin` header names another site are refused
with 403, in addition to the session cookie being `SameSite=Lax`.

### Idempotency

Send `Idempotency-Key: <uuid>` on POSTs that move stock (goods receipts
today). The first request runs; its response is stored in the same
transaction, and every later request with the key gets that response back
with `Idempotent-Replayed: true` — including a duplicate that arrives while
the first is still running. The same key with a different body is refused
with 422. Generate one key per user intent (when the form opens), not per
click.

### Document numbers

`PO-2026-0258`, `GRN-2026-0389`, `RMB-2026-0483`: assigned by the server
from a per-company counter advanced inside the transaction, so numbers are
unique under concurrency and a rolled-back request does not leave a gap. A
series continues from the highest number already in the table.

### Stock ledger

Every stock change is a signed `StockMovement`; `InventoryBalance` is its
running total per material and location, updated in the same transaction
(`src/server/services/stock-ledger.service.ts`).

| Rule | |
| --- | --- |
| No negative stock | An outflow larger than the bucket it draws from is refused (422) |
| Held stock | `quarantineQty` is the part of on-hand held by quality (lots PENDING or QUARANTINE); issues cannot use it |
| Valuation | Moving average per balance: receipts add at their cost, issues remove at the current average; an emptied balance is valued at exactly 0 |
| Standard cost | `Material.standardCost` follows the company-wide moving average after every priced receipt |
| Who | Each movement records `postedById` |

### Purchase order lifecycle

```
DRAFT ─approve─▶ APPROVED ─send─▶ ORDERED
  │                 └──── receive ───┴─▶ PARTIALLY_RECEIVED ─▶ FULLY_RECEIVED
  └──────────── cancel (any open state) ──────────▶ CANCELLED
```

Only a DRAFT can be edited or deleted. Approval requires the vendor to be
active and on the Approved Supplier List; company setting
`purchasing.allowSelfApproval = false` stops the PO's creator approving it.
A wrong transition is a 409 naming the current status.

### Goods receipt

- `receivedQty` is accepted into stock; `rejectedQty` is recorded on the
  receipt, never stocked, and not counted against the PO.
- Accepted quantity may exceed the outstanding quantity only by
  `purchasing.overReceiptTolerancePct` (default 0). Concurrent receipts
  against one PO serialise, so together they cannot over-receive either.
- A batch-tracked line creates a lot. Its expiry is the one given, else the
  receipt date plus the material's shelf life. Inspection defaults to
  PENDING, so the stock is held until released. A material without lots can
  only be received APPROVED — there would be nothing to release later.
- Receipts cannot be future-dated or dated before the order. Today is the
  company's own date in its time zone.
- The PO becomes FULLY_RECEIVED (with `actualDeliveryDate`) when every line
  is received in full, else PARTIALLY_RECEIVED.

### Lot quality decisions

| To | Effect |
| --- | --- |
| APPROVED | Held stock becomes unrestricted. A purchased lot needs a CoA reference on record or in the request |
| QUARANTINE | Unrestricted stock becomes held. `reason` required |
| REJECTED | What remains leaves stock: RETURN (purchased) or SCRAP (produced). Final. `reason` required |

The lot's receipt lines take the same inspection status.

### Sales order lifecycle and dispatch

```
CONFIRMED ─dispatch (part)─▶ PROCESSING ─dispatch (rest)─▶ DISPATCHED ─deliver─▶ DELIVERED
    └──────────── cancel ────────┴──▶ CANCELLED
```

- An order is booked CONFIRMED and can be edited only while nothing has
  shipped. Every line ships from one location (the line's, else the order's).
- Dispatch needs `sales-order:dispatch` — a warehouse permission, separate
  from `sales-order:update`, held by ADMIN and INVENTORY.
- A line may ship up to its open quantity plus `sales.overDispatchTolerancePct`
  (default 0), and never more than unrestricted stock: held (quarantined) stock
  and other orders' shipments are respected under concurrency.
- Batch-tracked lines ship from lots. Named lots must be APPROVED, at the
  line's location, unexpired on the dispatch date and hold enough; with no
  lots named the server allocates first-expiry-first-out (then oldest
  receipt, then lot number). Each lot draw is an ISSUE movement referencing
  the order line, which is what forward traceability reads.
- Shipping every line in full makes the order DISPATCHED and the delivery
  IN_TRANSIT; `dispatchDate` records the latest dispatch.

### Work order lifecycle, issue and output

```
PLANNED ─firm─▶ FIRMED ─release─▶ RELEASED ─issue/output─▶ IN_PROGRESS ─complete─▶ COMPLETED ─close─▶ CLOSED
   └──────────── cancel (nothing issued or produced) ──────────▶ CANCELLED
```

- Components are snapshotted from the BOM version the order pins:
  qty ÷ base × order qty × (1 + scrap), rounded up at 6 places; optional
  lines are left out; a material on several lines is summed. A BOM line
  quoted in a unit other than the material's stocking unit is refused (422) —
  the schema holds no unit conversions to apply.
- Issues draw components through the stock ledger as PRODUCTION_ISSUE
  movements referencing the work order, from named lots or first-expiry-
  first-out. A component may be issued up to its requirement plus
  `production.overIssueTolerancePct` (default 10).
- Output is a PRODUCTION_RECEIPT into a new lot (FGB-…), held PENDING until
  quality releases it, capped at plan plus
  `production.overProductionTolerancePct` (default 10). It is valued at the
  actual cost of what was issued: partial output takes its share of the
  not-yet-capitalised value, the completing output takes the remainder. With
  nothing issued, the product's standard cost is used.
- Traceability reads the ledger: a component drawn from several lots lists
  each lot on the finished lot's backward trace, and each of those lots lists
  the order on its forward trace. Backward completeness requires a CoA
  behind every lot drawn.

### User administration

- **You can only hand out what you hold.** Assigning roles, composing or
  editing a custom role, resetting someone's password, and activating or
  deactivating them are all refused (403) if the role or user carries a
  permission the acting administrator lacks.
- **There is always an administrator.** The last active user with the ADMIN
  role cannot be deactivated or lose it; nobody can deactivate themselves.
- System roles cannot be edited or deleted; create a custom role instead.
- **Temporary passwords.** A user created or reset by an administrator must
  set their own password before anything else: until then every endpoint
  except `/auth/change-password`, `/auth/me` and `/auth/logout` answers 403,
  and the app shows only the set-password form. Server-generated passwords
  are returned once, with `Cache-Control: no-store`, and never logged.

### Sessions

A session ends after `SESSION_MAX_AGE_SECONDS` (default 8 h) without
activity; each request (at most once a minute) pushes expiry out again, up
to `SESSION_ABSOLUTE_MAX_SECONDS` (default 24 h) after sign-in, when it ends
regardless.

## Authentication

`POST /api/v1/auth/login` with `{ "email": "...", "password": "..." }` sets an
`anvaya.session` cookie: httpOnly, SameSite=Lax, Secure in production. The
token is never in the response body, so no script on the page can read it.

The cookie holds a random 256-bit token; only its SHA-256 is stored. The
session row is the source of truth, which is what makes revocation real — a
signed-out or revoked session stops working immediately, where a self-contained
JWT would stay valid until it expired.

Failure behaviour is uniform on purpose. An unknown email, a wrong password, a
locked account and a deactivated user all return **401 `UNAUTHENTICATED`** with
`"Incorrect email or password"`. Distinguishing them would let an attacker
enumerate valid addresses. The unknown-email path still performs a full argon2
verification against a placeholder hash so it costs the same time as a real one.

Five consecutive failures lock an account for 15 minutes. While locked, even
the correct password is rejected — with the same generic message.

## Authorization

Permissions are `resource:action` strings held by roles, which are rows in the
database rather than hard-coded names. An endpoint declares what it needs:

```ts
export const GET = withApi(handler, { permission: "audit:read" });
```

Endpoints are private by default — `withApi` requires a session unless the
handler passes `{ auth: false }`, so forgetting to think about authorization
fails closed rather than open.

`/api/v1/auth/me` returns the caller's permission list. The client uses it to
decide what to *offer*; it never decides what is *allowed*. Every request is
checked again server-side, so a user who edits that list in devtools gets
buttons that return 403.

`GET /api/v1/health` →

```json
{
  "data": {
    "status": "ok",
    "version": "0.0.0",
    "uptimeSeconds": 2487,
    "checks": { "database": { "ok": true, "latencyMs": 22 } }
  }
}
```

Returns 500 with `code: "INTERNAL"` when the database is unreachable, so a
deploy check fails when the app cannot actually serve requests.

### Planned

Added in later phases: auth and session (Phase 3); materials, categories, units,
locations, vendors, customers (Phase 4); BOMs and inventory (Phase 5); sales
orders, forecasts, purchase orders, work orders (Phase 6); MRP runs,
requirements, planned orders, pegging and exceptions (Phase 7).
