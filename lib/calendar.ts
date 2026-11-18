// No imports: scripts/check-trend.mjs imports this file with Node.

/** Monday-first weeks for "YYYY-MM": null for blanks before day 1 and after the last day; length is a multiple of 7. */
export function calendarCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
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
