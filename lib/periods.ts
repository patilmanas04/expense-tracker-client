// No runtime imports: scripts/check-periods.mjs imports this file with Node.
// Day keys are IST "YYYY-MM-DD"; the maths runs on their parts with Date.UTC (no Intl, no time zones).
import type { PayPeriod, PayPeriods } from "./types";

/** How months are cut: calendar months, or pay periods with "Month starts on payday" on (server: pay_periods.span). */
export interface MonthCalendar {
  /** "Month starts on payday" is on and at least one pay period exists. */
  payday: boolean;
  /** The month holding today ("" until today is known). */
  current: string;
  /** The month a day is listed under: its pay period's name, else its calendar month. */
  monthOf(day: string): string;
  /** First day of a month: the period's start, a cut calendar month's first uncovered day, or the 1st. */
  first(month: string): string;
  /** Last day: the period's end (for the open period, its expected last day, never before today); a calendar month's last uncovered day. */
  last(month: string): string;
  /** 1-based day of `day` within its own month (can exceed 31). */
  dayIndex(day: string): number;
}

const DAY_MS = 86_400_000;

const toTime = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

function fromTime(time: number): string {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const addDays = (day: string, delta: number) => fromTime(toTime(day) + delta * DAY_MS);

/** Last day of "YYYY-MM". */
const monthEnd = (month: string) => fromTime(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));

/**
 * The open period's expected last day (server: pay_periods.expected_last_day): the same day number one month
 * after `start`, clamped to that month's length, minus one day. 31 Oct → 29 Nov; 3 Dec → 2 Jan; 31 Jan 2027 → 27 Feb.
 */
export function expectedLastDay(start: string): string {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)); // 1-based, so it's also next month's 0-based index
  const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fromTime(Date.UTC(y, m, Math.min(Number(start.slice(8, 10)), length)) - DAY_MS);
}

function calendarMonths(today: string): MonthCalendar {
  return {
    payday: false,
    current: today.slice(0, 7),
    monthOf: (day) => day.slice(0, 7),
    first: (month) => `${month}-01`,
    last: monthEnd,
    dayIndex: (day) => Number(day.slice(8, 10)),
  };
}

/** Calendar months when `data` is missing, off or has no periods; otherwise the pay periods, with calendar pieces between them. */
export function monthCalendar(data: PayPeriods | null, today: string): MonthCalendar {
  if (!data?.enabled || !data.periods.length) return calendarMonths(today);
  // "YYYY-MM-DD" strings compare in date order.
  const periods: PayPeriod[] = [...data.periods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const byName = new Map(periods.map((p, i) => [p.month, i]));

  /** Index of the last period starting on or before `day`, or −1. */
  const startingBy = (day: string) => {
    let lo = 0;
    let hi = periods.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (periods[mid].start <= day) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };

  const monthOf = (day: string) => {
    const i = startingBy(day);
    return i >= 0 && day <= periods[i].end ? periods[i].month : day.slice(0, 7);
  };

  const cache = new Map<string, [string, string]>();
  const bounds = (month: string): [string, string] => {
    const cached = cache.get(month);
    if (cached) return cached;
    let result: [string, string];
    const i = byName.get(month);
    if (i !== undefined) {
      const p = periods[i];
      const open = i === periods.length - 1 && p.start <= today && today <= p.end;
      if (open) {
        const expected = expectedLastDay(p.start);
        const atLeast = expected > today ? expected : today;
        result = [p.start, atLeast < p.end ? atLeast : p.end];
      } else result = [p.start, p.end];
    } else {
      // A calendar month, cut to the days no pay period covers.
      const calendarFirst = `${month}-01`;
      const calendarLast = monthEnd(month);
      let first = calendarFirst;
      let last = calendarLast;
      const before = startingBy(first);
      if (before >= 0 && first <= periods[before].end) first = addDays(periods[before].end, 1);
      const next = startingBy(addDays(first, -1)) + 1; // the first period starting on or after `first`
      if (next < periods.length && periods[next].start <= last) last = addDays(periods[next].start, -1);
      // Nothing left (a skipped name): the calendar month's own bounds.
      result = first <= last ? [first, last] : [calendarFirst, calendarLast];
    }
    cache.set(month, result);
    return result;
  };

  const first = (month: string) => bounds(month)[0];
  const last = (month: string) => bounds(month)[1];
  return {
    payday: true,
    current: today ? monthOf(today) : "",
    monthOf,
    first,
    last,
    dayIndex: (day) => Math.round((toTime(day) - toTime(first(monthOf(day)))) / DAY_MS) + 1,
  };
}
