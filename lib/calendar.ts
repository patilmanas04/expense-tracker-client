// No imports: scripts/check-trend.mjs imports this file with Node.

/** Monday-first weeks for "YYYY-MM": null for blanks before day 1 and after the last day; length is a multiple of 7. */
export function calendarCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return calendarCellsBetween(`${month}-01`, `${month}-${String(days).padStart(2, "0")}`);
}

/**
 * Monday-first weeks from `first` to `last` ("YYYY-MM-DD", inclusive; one month or one pay period): null for
 * blanks before `first` (by its weekday) and after `last`; length is a multiple of 7.
 */
export function calendarCellsBetween(first: string, last: string): (string | null)[] {
  const [y, m, d] = first.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const lead = (start.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let date = start; ; date = new Date(date.getTime() + 86_400_000)) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    if (key > last) break;
    cells.push(key);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Shade step from a day's spending and the month's largest day: 0 none (spent <= 0 or max <= 0), 1 ratio <= 0.25, 2 <= 0.5, 3 <= 0.75, 4 above. */
export function shadeStep(spent: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (spent <= 0 || max <= 0) return 0;
  const ratio = spent / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** Accent opacity per step, in percent. */
export const SHADE_PERCENT = [0, 12, 30, 55, 85] as const;
