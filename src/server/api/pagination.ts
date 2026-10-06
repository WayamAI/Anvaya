import { z } from "zod";

/**
 * Cursor pagination, as /materials established it: `?limit=` (bounded, with
 * a default) and `?cursor=` (the id of the last row of the previous page).
 * Lists order by business fields with the id last, so a cursor position is
 * unambiguous; responses carry `meta: { nextCursor, limit, total? }`, and
 * `nextCursor` is null on the last page.
 */

export const cursorPage = (defaultLimit: number, maxLimit: number) => ({
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  cursor: z.string().trim().min(1).max(64).optional(),
});

/** Prisma arguments for one page: a row more than asked, to see whether more follow. */
export function cursorArgs(q: { limit: number; cursor?: string }) {
  return { take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) };
}

export function pageOf<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
