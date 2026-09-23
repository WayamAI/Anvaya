# Anvaya — Application Documentation

**Product:** Anvaya — Material Planning & ERP
**Vendor:** Anvaya
**Domain:** Manufacturing / Process Industries (FMCG, Chemicals, Discrete Assembly)
**Stack:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Recharts + React Router
**Live URL:**
- Production: https://production-planning-six.vercel.app

---

## 1. Purpose & Vision

Anvaya is an integrated **Material Planning, Production, Procurement, Inventory, and Traceability** platform designed for Indian manufacturing operations. It unifies the planning loop — from **demand forecast → MRP → purchase → production → inventory → batch traceability → field quality** — into a single operational dashboard.

The platform is targeted at plant managers, supply chain heads, procurement leads, QA managers, and CXOs who need:

- **Real-time visibility** into stock health, MRP exceptions, and production constraints.
- **Closed-loop traceability** linking raw material lots to finished serial numbers and customer shipments.
- **Live integration monitoring** with ERP/commerce/financial systems (Tally, Zoho, WooCommerce, etc.).
- **Quality intelligence** spanning supplier scorecards, SCARs, 8D investigations, and population-at-risk analysis.

---

## 2. Application Architecture

### 2.1 Layout

- **AppSidebar** (left, 240 px wide, collapsible to 64 px) — primary navigation grouped into 9 sections, with badges showing exception counts.
- **AppHeader** (top) — search, notifications, user menu.
- **AppLayout** — wraps every authenticated route with sidebar + header.
- **Login** — entry route; the rest of the app is gated behind it.

### 2.2 Design System

- Tailwind semantic tokens defined in `index.css` and `tailwind.config.ts` — all colors stored as HSL.
- Domain-specific BOM-layer colors:
  - **EBOM → Purple** (`--ebom`)
  - **MBOM → Teal** (`--mbom`)
  - **SBOM → Amber** (`--sbom`)
- Used as badges, card border accents, and chart series — never as page-fill backgrounds.
- shadcn/ui as the only component library — no parallel UI kits.

### 2.3 Data Layer

`src/data/` holds a relational, cross-referenced mock data model that powers traceability and batch tracking end-to-end:

| File | Purpose |
|------|---------|
| `vendors.ts` | Vendor master with quality scorecards and SCAR history |
| `purchase_orders.ts` | POs with line-item GRN linkage |
| `grn.ts` | Goods Receipt Notes with QC results |
| `rm_batches.ts` | Raw material batches linked to GRN + PO + vendor |
| `production_batches.ts` | Production batches consuming RM batches |
| `sales_orders.ts` | Sales orders linked to dispatched batches/serials |
| `traceability.ts` | Master trace records (lot/serial → 3-layer BOM) |

This makes every link in the trace chain real and clickable rather than display-only text.

---

## 3. Navigation Map

Nine top-level sections, 32 functional pages plus Login.

1. **Dashboard** — Planning Overview
2. **Material Planning** — MRP Run, Material Requirements, BOM Management, Safety Stock, Stock Exhaustion Alerts
3. **Production** — Production Schedule, Work Orders, Constraints, Schedule Updates
4. **Inventory** — Stock Overview, Multi-Location, Batch & Serial Tracking, Inventory Health
5. **Purchase** — Purchase Planning, Purchase Orders, Vendor Management, Procurement Analytics
6. **Demand & Forecasting** — Demand Forecast, Forecast vs Actuals, Sales Order Intake
7. **Traceability** — BOM Traceability
8. **Analytics & Reports** — BI Dashboard, Material Coverage, Procurement Reports, MRP Efficiency, Custom Reports
9. **Settings** — Company & Warehouses, Users & Roles, Integrations, Alert Configuration

---

## 4. Module Reference

### 4.1 Dashboard — Planning Overview (`/`)

The CXO landing page. Aggregates KPIs across every module:

- **Material readiness %**, **MRP exceptions**, **open work orders**, **stock-out risk count**.
- **Traceability health**: trace completeness %, average RCA closure time, open SCARs, suspect-lot consumption alerts.
- Cards drill through into the relevant module.

### 4.2 Material Planning

#### MRP Run & Results (`/mrp-run`)
Triggers an MRP simulation across the planning horizon. Outputs net requirements, planned orders, expected shortages, and reschedule suggestions. Run history is kept for audit.

#### Material Requirements (`/material-requirements`)
Detailed line-level requirement view: gross req, allocated, on-order, projected on-hand, net requirement bucketed by week.

#### BOM Management (`/bom-management`)
Multi-level BOM editor with:
- Revision history timeline.
- ECO (Engineering Change Order) linkage.
- Field failure sparklines per component.
- Color-coded EBOM/MBOM/SBOM layers.

#### Safety Stock (`/safety-stock`)
Maintains policy-driven safety stock per SKU/warehouse, with service level targets and consumption variability.

#### Stock Exhaustion Alerts (`/stock-alerts`) *(badge: 7)*
Live list of SKUs projected to run out within their lead time horizon.

### 4.3 Production

#### Production Schedule (`/production-schedule`)
Gantt-style sequencing of work orders against work-centers and shifts.

#### Work Orders (`/work-orders`)
Per-WO detail with:
- **As-built genealogy tree** showing every input lot consumed.
- **Lot Scan Simulator** — validates each scanned lot against the Approved Supplier List (ASL); hard-blocks scans at CTQ stations.
- Status, operator notes, yield, scrap.

#### Constraints (`/production-constraints`) *(badge: 3)*
Capacity bottlenecks, tool/operator unavailability, missing components blocking specific work orders.

#### Schedule Updates (`/schedule-updates`)
Reschedule recommendations from MRP and constraint changes — accept/reject with audit trail.

### 4.4 Inventory

#### Stock Overview (`/stock-overview`)
Global on-hand by SKU with available/allocated/in-transit breakdown.

#### Multi-Location Inventory (`/multi-location`)
Stock distribution across warehouses, plants, and bonded zones.

#### Batch & Serial Tracking (`/batch-tracking`)
The traceability centerpiece. Fully data-integrated:
- **Backward Trace:** Finished Batch → Production Batch → RM Consumption → RM Batches → GRN → PO → Vendor.
- **Forward Trace:** Batch → Sales Orders → Customer dispatches.
- **Containment Panel:** for quarantined/failed batches, identifies suspect inputs, calculates units at risk in the field, and exposes hold actions.
- **GRN Search Mode:** lookup a GRN to see QC report, vendor scorecard, and downstream batches.
- Drawer overlays for QC reports, vendor scorecards, and product formulas — never navigates away from the trace.
- All references are clickable teal links matching the existing batch-link style.

#### Inventory Health (`/inventory-health`)
Slow-moving, dead stock, expiry risk, and ABC/XYZ classification.

### 4.5 Purchase

#### Purchase Planning (`/purchase-planning`)
Converts MRP planned orders into purchase requisitions with vendor suggestions.

#### Purchase Orders (`/purchase-orders`)
PO lifecycle: Draft → Approved → Ordered → Partially/Fully Received → Closed. Each line item references the GRNs that fulfilled it.

#### Vendor Management (`/vendor-management`)
- Vendor master + ASL flag + approved materials.
- **Supplier Quality Heatmap.**
- Lot register per vendor.
- **Raise SCAR** workflow (Supplier Corrective Action Request) with status tracking (Open/In Progress/Closed).
- Quality scorecard: defect rate %, COPQ amount, OTIF %, last audit result.

#### Procurement Analytics (`/procurement-analytics`)
Spend analysis, vendor concentration, price variance, savings tracking.

### 4.6 Demand & Forecasting

#### Demand Forecast (`/demand-forecast`)
Statistical forecast per SKU/region/channel.

#### Forecast vs Actuals (`/forecast-actuals`)
Bias and accuracy (MAPE/WAPE) trended over time.

#### Sales Order Intake (`/sales-orders`)
Incoming order pipeline that feeds demand and triggers MRP.

### 4.7 Traceability (`/traceability`)

A dedicated investigation hub:

- **Trace Search:** lookup a serial or lot number; renders the **3-layer BOM trace** (EBOM purple → MBOM teal → SBOM amber) with status checks at each layer.
- **8D Report Generator:** exports the investigation as text/PDF following standard 8D structure.
- **Population at Risk:** a **5-step containment funnel** (Total Built → Shipped → In Field → Suspect → At Risk), reactive to lot, supplier, and date filters.
- Cross-links into Vendor Management (SCAR), Work Orders (genealogy), and Batch Tracking (containment).

### 4.8 Analytics & Reports

#### BI Dashboard (`/bi-dashboard`)
Cross-module charts and configurable widgets.

#### Material Coverage (`/material-coverage`)
Days-of-cover heatmap per material × warehouse.

#### Procurement Reports (`/procurement-reports`)
Pre-built reports: PO aging, GRN variance, supplier OTIF.

#### MRP Efficiency (`/mrp-efficiency`)
Plan-vs-execution metrics: planned-order accuracy, reschedule churn, exception trends.

#### Custom Reports (`/custom-reports`)
User-defined report builder with filters, columns, and export.

### 4.9 Settings

#### Company & Warehouses (`/company-settings`)
Legal entity, plants, warehouses, costing currency, fiscal calendar.

#### Users & Roles (`/users-roles`)
RBAC. Roles are stored in a dedicated `user_roles` table (never on the profile) with a `has_role` security-definer function — protecting against privilege-escalation.

#### Integrations (`/integrations`)
A fully redesigned **Integration Hub** rather than a flat settings page:
- **KPI Strip:** Active Pipelines, Degraded/Error counts, Records Today, Avg Uptime.
- **Per-Integration Cards** (Tally, Zoho, WooCommerce, Shopify, etc.) with 3 expandable tabs:
  - **Data Flows** — entity-level inbound/outbound counts and error rate.
  - **Sync History** — timestamped log with duration and error detail.
  - **Configuration** — API version, auth method, rate-limit progress bar.
- **Operational Controls:** Force Sync, Pause/Resume, Settings.
- Filter tabs by category (Financial, Commerce, Logistics) or by issues.
- Semantic warning banners for degraded/failing pipelines.

#### Alert Configuration (`/alert-config`)
Rule-based alerting:
- **Built-in rules:** revision mismatch, suspect-lot consumption, stock-exhaustion projection, OTIF breach, COPQ spike.
- **Channels:** email, in-app, webhook.
- **Alert Feed** tab: live event stream with acknowledgement workflow.

---

## 5. Cross-Cutting Capabilities

### 5.1 Traceability & Quality Loop
Every record references the next link in the chain through stable IDs (`vendor_id`, `po_number`, `grn_number`, `rm_batch_number`, `batch_number`, `sales_order_id`). This enables:
- One-click backward trace from any failure to the originating supplier lot.
- One-click forward trace to every customer that received a suspect batch.
- Automatic computation of **trace completeness %** and **population at risk**.

### 5.2 Exception-Driven UX
Sidebar badges, dashboard alerts, and per-module banners surface only what needs attention — no doom-scrolling through healthy data.

### 5.3 Drawer-First Detail Pattern
Detail views (QC report, vendor scorecard, formula card, sync history) open as right-side drawer overlays so the user never loses the parent context.

### 5.4 Export & Reporting
- 8D reports (PDF / text)
- CSV exports for affected serials, containment plans, custom reports.
- Procurement and MRP report templates.

### 5.5 Security Posture
- Roles in dedicated `user_roles` table.
- `has_role()` security-definer function for RLS policies.
- No client-side admin checks.
- Secrets stored via the secrets manager — never hard-coded.

---

## 6. Data Model Snapshot

```
Vendor (SUP-xxx)
  └── PurchaseOrder (PO-xxxx)
        └── POLineItem
              └── GRN (GRN-xxxx)        ── QC result
                    └── RMBatch (LOT-xxxx)
                          └── ProductionBatch (B-xxxx)   ── QC status
                                └── SalesOrder (SO-xxxx)
                                      └── Customer dispatch
```

Each arrow is bidirectionally navigable in the UI.

---

## 7. Branding & Identity

- **Logo:** Anvaya mark, centered above the wordmark in the sidebar.
- **Wordmark:** "Anvaya" with subheading "Material Planning & ERP", left-aligned beneath the logo.
- **Accent color:** Teal (used for primary links such as batch numbers like `B-2026-0412`).
- **Status badges:** Approved (green), Quarantine (amber), Pending (neutral), Failed (red) — consistent across every module.

---

## 8. Roadmap-Ready Extension Points

- Real backend hookup (auth, persistence, edge functions) to replace the current demo-mode login.
- Real-time sync activity log on the Integration Hub.
- 30-day uptime/error trend charts per integration.
- Visual genealogy flowchart for batch tracking.
- Connecting Traceability search to the linked GRN→RM→Production→Sales chain (end-to-end, single query).

---

*Document generated automatically from the live Anvaya codebase.*
