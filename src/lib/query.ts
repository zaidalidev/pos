/**
 * Lean list helpers — same shape you'll want with Neon Data API
 * (filter + page on the server; here we do it in memory cheaply).
 */

export type PageResult<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Slice a list into a page (0-based page index). */
export function paginate<T>(items: T[], page = 0, pageSize = 50): PageResult<T> {
  const size = Math.max(1, pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    rows: items.slice(safePage * size, safePage * size + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
  };
}

/** Keep newest N items (assumes array is already newest-first). */
export function takeRecent<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  return items.length <= limit ? items : items.slice(0, limit);
}

/** Case-insensitive includes filter over selected string fields. */
export function searchBy<T>(items: T[], query: string, fields: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => fields(item).toLowerCase().includes(q));
}

/**
 * Filter by ISO date string field within an inclusive YYYY-MM-DD range.
 * Empty from/to means open-ended.
 */
export function inDateRange<T>(
  items: T[],
  getDate: (item: T) => string,
  from = "",
  to = "",
): T[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = getDate(item).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
