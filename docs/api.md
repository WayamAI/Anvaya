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
