// No runtime imports: scripts/check-trend.mjs imports this file with Node.

/** Any month point with a spending figure (analytics' MonthPoint fits). */
export interface TrendPoint {
  month: string; // "YYYY-MM"
  expense: number; // minor units
}

export interface TrendSummary<P extends TrendPoint> {
  /** Points to draw: leading months with no spending are dropped (the in-progress month always stays). */
  shown: P[];
  /** Mean spending over complete shown months that have spending; null until one exists. Rounded to whole paise. */
  average: number | null;
  /** Largest of those months; null until one exists. */
  highest: { month: string; minor: number } | null;
  /** Set only when the last shown month is the month in progress. */
  current: {
    month: string;
    /** This month's spending up to today's day (countsDay <= day). */
    soFar: number;
    /** Mean over the same complete months of their spending up to the same day; null with no complete month. */
    usualSoFar: number | null;
    /** soFar / usualSoFar − 1; null when usualSoFar is null or 0. */
    change: number | null;
  } | null;
}

/**
 * `upToDay[month]` = that month's counted spending with countsDay <= today's day (missing = 0).
 * `currentMonth` is monthOf(today); months >= it are never "complete".
 */
export function summarizeTrend<P extends TrendPoint>(
  points: P[],
  currentMonth: string,
  upToDay: Record<string, number>,
): TrendSummary<P> {
  const first = points.findIndex((p) => p.expense > 0 || p.month === currentMonth);
  const shown = first < 0 ? [] : points.slice(first);
  // "YYYY-MM" strings compare in date order. A month with nothing spent after the first one stays drawn.
  const complete = shown.filter((p) => p.month < currentMonth && p.expense > 0);
  const average = complete.length ? Math.round(complete.reduce((s, p) => s + p.expense, 0) / complete.length) : null;
  let highest: TrendSummary<P>["highest"] = null;
  for (const p of complete) if (!highest || p.expense > highest.minor) highest = { month: p.month, minor: p.expense };
  let current: TrendSummary<P>["current"] = null;
  if (shown.at(-1)?.month === currentMonth) {
    const soFar = upToDay[currentMonth] ?? 0;
    const usualSoFar = complete.length
      ? Math.round(complete.reduce((s, p) => s + (upToDay[p.month] ?? 0), 0) / complete.length)
      : null;
    current = { month: currentMonth, soFar, usualSoFar, change: usualSoFar ? soFar / usualSoFar - 1 : null };
  }
  return { shown, average, highest, current };
}
