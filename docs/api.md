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
