/**
 * Which sidebar items a user is offered.
 *
 * Each screen is mapped to the read permission its API calls already enforce
 * — the same codes, read from the same session (`can`) — so the menu offers
 * exactly the screens that would load. This is presentation only: hiding an
 * item stops nobody, and every endpoint still checks for itself.
 *
 * `null` means no permission gates the screen: the dashboard, which shows
 * only the sections the user's permissions allow.
 * Every path in the sidebar must have an entry; a test enforces it.
 */

type Rule = string | string[] | null;

export const NAV_ACCESS: Record<string, Rule> = {
  "/": null,
  "/mrp-run": "mrp:read",
  "/material-requirements": "mrp:read",
  "/bom-management": "bom:read",
  "/safety-stock": "inventory:read",
  "/stock-alerts": "inventory:read",
  "/production-schedule": "work-order:read",
  "/work-orders": "work-order:read",
  "/materials": "material:read",
  "/customers": "customer:read",
  "/stock-overview": "inventory:read",
  "/multi-location": "inventory:read",
  "/batch-tracking": "inventory:read",
  "/inventory-health": "inventory:read",
  "/purchase-planning": "mrp:read",
  "/purchase-orders": "purchase-order:read",
  "/vendor-management": "vendor:read",
  "/sales-orders": "sales-order:read",
  "/material-coverage": "mrp:read",
  "/company-settings": "setting:read",
  "/users-roles": ["user:read", "role:read"],
};

export function canSeeNavItem(path: string, can: (permission: string) => boolean): boolean {
  if (!path) return true; // a control (theme, sign out), not a screen
  const rule = NAV_ACCESS[path];
  if (rule === undefined) return false; // unknown route: offer nothing unchecked
  if (rule === null) return true;
  return Array.isArray(rule) ? rule.some(can) : can(rule);
}

/**
 * Sections with only the items the user may open. A section left empty is
 * dropped; one left with only controls (Settings: theme and sign-out) stays,
 * since signing out must always be possible.
 */
export function visibleSections<S extends { items: { path: string }[] }>(sections: S[], can: (permission: string) => boolean): S[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => canSeeNavItem(i.path, can)) }))
    .filter((s) => s.items.length > 0);
}
