/** Calendar-day arithmetic on YYYY-MM-DD strings, in UTC, for planning. */

const DAY_MS = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  return new Date(t(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((t(to) - t(from)) / DAY_MS);
}

export const minDate = (a: string, b: string) => (a < b ? a : b);
export const maxDate = (a: string, b: string) => (a > b ? a : b);

/** Quantities to the columns' 6 decimal places, so float noise never reaches the plan. */
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
