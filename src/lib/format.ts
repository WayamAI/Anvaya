/** ₹8.4 Cr / ₹4.92 L / ₹9,800 — the scale a planner reads money in. */
export function inrCompact(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Quantities as planners write them: Indian grouping, at most two decimals. */
export function formatQty(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
