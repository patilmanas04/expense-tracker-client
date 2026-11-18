import { INVESTED, NOT_COUNTED, SALARY, SALARY_NEXT_MONTH_FROM, categoryName } from "./categories";
import {
  dayKey,
  dayOfMonth,
  daySpan,
  daysInMonth,
  formatPercent,
  monthName,
  monthOf,
  monthShortName,
  shiftMonth,
  toMinor,
} from "./format";
import { tagsOf } from "./tags";
import type { Transaction, TxType } from "./types";

/** A transaction with precomputed IST day/month and an integer amount in paise. */
export interface Txn extends Transaction {
  minor: number;
  day: string;
  month: string;
  time: number;
  /** The month this counts toward in totals: its own, or the next for salary paid late in the month. */
  countsIn: string;
  /** Its day within `countsIn`: the 1st when carried forward. For same-days comparisons and daily charts. */
  countsDay: number;
  /** Tags in the note (lib/tags.ts), computed once in prepare(). */
  tags: string[];
}

/** Salary paid on the 16th or later is mostly money for the next month, so it counts there. */
export const carriedForward = (t: Pick<Txn, "countsIn" | "month">) => t.countsIn !== t.month;

// The backend stores UTC; some drivers serialise it without an offset.
const asUtc = (iso: string) => (/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);

export function prepare(list: Transaction[]): Txn[] {
  const seen = new Set<string>();
  const out: Txn[] = [];
  for (const t of list) {
    if (seen.has(t.id)) continue; // pages can overlap if a new SMS lands mid-fetch
    seen.add(t.id);
    const iso = asUtc(t.transaction_time);
    const day = dayKey(iso);
    const carried = t.type === "CREDIT" && t.is_parsed && categoryName(t) === SALARY && dayOfMonth(day) >= SALARY_NEXT_MONTH_FROM;
    out.push({
      ...t,
      transaction_time: iso,
      created_at: asUtc(t.created_at),
      updated_at: asUtc(t.updated_at ?? t.created_at),
      duplicate_of: t.duplicate_of ?? null, // an older backend doesn't send it: not held out
      minor: toMinor(t.amount),
      day,
      month: monthOf(day),
      time: Date.parse(iso),
      countsIn: carried ? shiftMonth(monthOf(day), 1) : monthOf(day),
      countsDay: carried ? 1 : dayOfMonth(day),
      tags: tagsOf(t.notes),
    });
  }
  return out.sort((a, b) => b.time - a.time);
}

/**
 * Adds new rows and swaps in changed ones (edited, or categorised later). Unchanged rows keep
 * their object, and nothing new returns the same array, so React skips re-rendering.
 */
export function mergeTransactions(current: Txn[], fresh: Transaction[]): Txn[] {
  const byId = new Map(current.map((t) => [t.id, t]));
  let changed = false;
  for (const t of prepare(fresh)) {
    if (byId.get(t.id)?.updated_at === t.updated_at) continue;
    byId.set(t.id, t);
    changed = true;
  }
  return changed ? [...byId.values()].sort((a, b) => b.time - a.time) : current;
}

/** Newest `updated_at` seen; the polling cursor. */
export function latestUpdatedAt(txns: Txn[]): string | null {
  let latest: string | null = null;
  let latestTime = -Infinity;
  for (const t of txns) {
    const time = Date.parse(t.updated_at);
    if (time > latestTime) {
      latestTime = time;
      latest = t.updated_at;
    }
  }
  return latest;
}

/** A possible duplicate you haven't decided on: held out of every total (server: duplicate_flags). */
export const isHeldOut = (t: Pick<Transaction, "duplicate_of">) => t.duplicate_of != null;

/** Listed under "Needs review": SMS Folio couldn't read, and possible duplicates. */
export const needsReview = (t: Pick<Transaction, "is_parsed" | "duplicate_of">) => !t.is_parsed || isHeldOut(t);

/** Counts toward Spent (debits) or Income (credits): parsed, in this currency, and not a card bill
 * payment, a transfer between your own accounts or an investment (NOT_COUNTED / INVESTED in
 * categories.ts). Unparsed SMS and possible duplicates stay visible for review but never count. */
export const counts = (t: Txn, currency: string) =>
  t.is_parsed &&
  !isHeldOut(t) &&
  t.currency === currency &&
  !NOT_COUNTED.has(categoryName(t)) &&
  !INVESTED.has(categoryName(t));

/** Money put into investments and deposits: "Invested", never Spent. */
export const isInvested = (t: Txn, currency: string) =>
  t.is_parsed && !isHeldOut(t) && t.currency === currency && t.type === "DEBIT" && INVESTED.has(categoryName(t));

export interface TripSummary {
  /** First and last day in the list ("YYYY-MM-DD"). */
  from: string;
  to: string;
  days: number;
  /** The 3 categories with the most spending, largest first. */
  top: { name: string; minor: number }[];
}

/** Span of the listed rows (all of them) and the top 3 spending categories among debits that count; null for an empty list. */
export function tripSummary(list: Txn[], currency: string): TripSummary | null {
  if (!list.length) return null;
  let from = list[0].day;
  let to = list[0].day;
  const byCategory = new Map<string, number>();
  for (const t of list) {
    if (t.day < from) from = t.day;
    if (t.day > to) to = t.day;
    // Doc 15 switches the sums to `t.counted`.
    if (t.type !== "DEBIT" || !counts(t, currency)) continue;
    const name = categoryName(t);
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.minor);
  }
  const top = [...byCategory]
    .map(([name, minor]) => ({ name, minor }))
    .sort((a, b) => b.minor - a.minor || a.name.localeCompare(b.name))
    .slice(0, 3);
  return { from, to, days: daySpan(from, to), top };
}

const sum = (list: Txn[]) => list.reduce((total, t) => total + t.minor, 0);

/** Month to compare against: the same days of the previous month while a month is in progress. */
function comparisonWindow(month: string, today: string) {
  const isCurrent = monthOf(today) === month;
  return { isCurrent, cutoff: isCurrent ? dayOfMonth(today) : 31, previous: shiftMonth(month, -1) };
}

export interface MonthTotals {
  income: number;
  expense: number;
  invested: number;
  net: number;
  count: number;
  review: number;
}

export function monthTotals(txns: Txn[], month: string, currency: string): MonthTotals {
  let income = 0;
  let expense = 0;
  let invested = 0;
  let count = 0;
  let review = 0;
  for (const t of txns) {
    if (t.month === month) {
      count += 1;
      if (needsReview(t)) review += 1;
    }
    // Money counts toward its month (salary paid late in the previous month counts here).
    if (t.countsIn !== month) continue;
    if (isInvested(t, currency)) {
      invested += t.minor;
      continue;
    }
    if (!counts(t, currency)) continue;
    if (t.type === "CREDIT") income += t.minor;
    else expense += t.minor;
  }
  return { income, expense, invested, net: income - expense - invested, count, review };
}

export interface Comparison {
  current: number;
  previous: number;
  delta: number;
  hasPrevious: boolean;
  isCurrent: boolean;
  previousMonth: string;
}

/** This month's spending (or income) against the same window of the previous month. */
export function compareWithPrevious(
  txns: Txn[],
  month: string,
  currency: string,
  today: string,
  type: TxType = "DEBIT",
): Comparison {
  const { isCurrent, cutoff, previous } = comparisonWindow(month, today);
  const pick = (m: string) =>
    txns.filter((t) => t.countsIn === m && t.type === type && counts(t, currency) && t.countsDay <= cutoff);
  const current = sum(pick(month));
  const prev = sum(pick(previous));
  return {
    current,
    previous: prev,
    delta: current - prev,
    hasPrevious: txns.some((t) => t.countsIn === previous && counts(t, currency)),
    isCurrent,
    previousMonth: previous,
  };
}

export interface CategoryStat {
  name: string;
  minor: number;
  share: number;
  count: number;
  previous: number;
  /** Fractional change vs the comparison window; null when the category is new. */
  change: number | null;
}

export function categoryBreakdown(
  txns: Txn[],
  month: string,
  currency: string,
  type: TxType,
  today: string,
): CategoryStat[] {
  const { cutoff, previous } = comparisonWindow(month, today);
  const current = new Map<string, { minor: number; count: number }>();
  const prev = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== type || !counts(t, currency)) continue;
    const name = categoryName(t);
    if (t.countsIn === month) {
      const entry = current.get(name) ?? { minor: 0, count: 0 };
      entry.minor += t.minor;
      entry.count += 1;
      current.set(name, entry);
    } else if (t.countsIn === previous && t.countsDay <= cutoff) {
      prev.set(name, (prev.get(name) ?? 0) + t.minor);
    }
  }
  const total = [...current.values()].reduce((s, e) => s + e.minor, 0);
  return [...current.entries()]
    .map(([name, { minor, count }]) => {
      const before = prev.get(name) ?? 0;
      return {
        name,
        minor,
        count,
        share: total ? minor / total : 0,
        previous: before,
        change: before > 0 ? (minor - before) / before : null,
      };
    })
    .sort((a, b) => b.minor - a.minor);
}

export interface DayPoint {
  day: string;
  label: string;
  income: number;
  expense: number;
}

/** One point per day of the month, up to today for the month in progress. */
export function dailySeries(txns: Txn[], month: string, currency: string, today: string): DayPoint[] {
  const last = monthOf(today) === month ? dayOfMonth(today) : daysInMonth(month);
  const points: DayPoint[] = Array.from({ length: last }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { day, label: String(i + 1), income: 0, expense: 0 };
  });
  for (const t of txns) {
    if (t.countsIn !== month || !counts(t, currency)) continue;
    const point = points[t.countsDay - 1]; // carried-forward salary lands on the 1st
    if (!point) continue;
    if (t.type === "CREDIT") point.income += t.minor;
    else point.expense += t.minor;
  }
  return points;
}

export interface MonthPoint {
  month: string;
  label: string;
  income: number;
  expense: number;
}

export function monthlyTrend(txns: Txn[], endMonth: string, currency: string, months = 6): MonthPoint[] {
  const points = Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(endMonth, i - months + 1);
    return { month, label: monthShortName(month), income: 0, expense: 0 };
  });
  const index = new Map(points.map((p) => [p.month, p]));
  for (const t of txns) {
    const point = index.get(t.countsIn);
    if (!point || !counts(t, currency)) continue;
    if (t.type === "CREDIT") point.income += t.minor;
    else point.expense += t.minor;
  }
  return points;
}

export interface MerchantStat {
  name: string;
  minor: number;
  count: number;
  category: string;
}

export function topMerchants(txns: Txn[], month: string, currency: string, type: TxType, limit = 5): MerchantStat[] {
  const byKey = new Map<string, MerchantStat>();
  for (const t of txns) {
    if (t.countsIn !== month || t.type !== type || !counts(t, currency) || !t.merchant) continue;
    const key = t.merchant.trim().toLowerCase();
    const entry = byKey.get(key) ?? { name: t.merchant.trim(), minor: 0, count: 0, category: categoryName(t) };
    entry.minor += t.minor;
    entry.count += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.minor - a.minor).slice(0, limit);
}

/** Habits: a payment under this counts as a small spend (under ₹500). */
export const SMALL_SPEND_MINOR = 50000; // under ₹500
/** Habits: small spends at one merchant in the month before it's listed as frequent. */
export const FREQUENT_MIN_COUNT = 8;

export interface FrequentSpend {
  name: string;
  category: string;
  count: number;
  minor: number;
}

/**
 * Merchants paid at least FREQUENT_MIN_COUNT times this month in counted INR debits under
 * SMALL_SPEND_MINOR each, grouped by Top merchants' key; most payments first. Totals sum `t.minor`
 * (switch to `t.counted` once doc 15 ships). `txns` are newest first, so the newest name labels a group.
 */
export function frequentSmallSpends(txns: Txn[], month: string, limit = 5): FrequentSpend[] {
  const byKey = new Map<string, FrequentSpend>();
  for (const t of txns) {
    if (t.countsIn !== month || t.type !== "DEBIT" || !counts(t, "INR") || t.minor >= SMALL_SPEND_MINOR) continue;
    if (merchantKey(t.merchant) === null) continue;
    const key = t.merchant!.trim().toLowerCase();
    const entry = byKey.get(key) ?? { name: t.merchant!.trim(), category: categoryName(t), count: 0, minor: 0 };
    entry.count += 1;
    entry.minor += t.minor;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .filter((f) => f.count >= FREQUENT_MIN_COUNT)
    .sort((a, b) => b.count - a.count || b.minor - a.minor || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** This month's largest counted INR debits, by full amount; newest first on a tie. */
export function biggestPayments(txns: Txn[], month: string, limit = 3): Txn[] {
  return txns
    .filter((t) => t.countsIn === month && t.type === "DEBIT" && counts(t, "INR"))
    .sort((a, b) => b.minor - a.minor || b.time - a.time)
    .slice(0, limit);
}

export interface Pace {
  spent: number;
  lastMonthTotal: number;
  projected: number;
  day: number;
  days: number;
  previousMonth: string;
}

/** Month-in-progress spending projected to month end, against last month's total. */
export function spendingPace(txns: Txn[], month: string, currency: string, today: string): Pace | null {
  if (monthOf(today) !== month) return null;
  const previousMonth = shiftMonth(month, -1);
  const expense = (m: string) => sum(txns.filter((t) => t.month === m && t.type === "DEBIT" && counts(t, currency)));
  const lastMonthTotal = expense(previousMonth);
  if (lastMonthTotal <= 0) return null;
  const spent = expense(month);
  const day = dayOfMonth(today);
  const days = daysInMonth(month);
  return { spent, lastMonthTotal, projected: Math.round((spent / day) * days), day, days, previousMonth };
}

/**
 * What's left of a limit for its period: (limit − spent) ÷ days left including today, rounded down to whole
 * rupees. Days count from `today` to the period's last day, both included; null when `today` is unknown ("") or
 * outside start…end (a stale summary). Amounts in minor units; left rounded down, over rounded up, to whole rupees.
 */
export type LeftToSpend =
  | { kind: "left"; leftMinor: number; perDayMinor: number | null; days: number | null }
  | { kind: "over"; overMinor: number };

export function leftToSpend(limitMinor: number, spentMinor: number, start: string, end: string, today: string): LeftToSpend {
  const diff = limitMinor - spentMinor;
  if (diff < 0) return { kind: "over", overMinor: Math.ceil(-diff / 100) * 100 };
  const leftMinor = Math.floor(diff / 100) * 100;
  // "YYYY-MM-DD" strings compare in date order.
  const days = today && start <= today && today <= end ? daySpan(today, end) : null;
  const perDayMinor = days ? Math.floor(leftMinor / 100 / days) * 100 : null;
  return { kind: "left", leftMinor, perDayMinor, days };
}

export interface Insight {
  text: string;
  tone: "good" | "bad" | "neutral";
}

export function buildInsight(txns: Txn[], month: string, currency: string, today: string): Insight | null {
  const comparison = compareWithPrevious(txns, month, currency, today);
  if (comparison.hasPrevious && comparison.previous > 0) {
    const change = comparison.delta / comparison.previous;
    if (Math.abs(change) >= 0.05) {
      const when = comparison.isCurrent ? "this time last month" : `in ${monthName(comparison.previousMonth)}`;
      return {
        text: `You spent ${formatPercent(Math.abs(change))} ${change < 0 ? "less" : "more"} than ${when}`,
        tone: change < 0 ? "good" : "bad",
      };
    }
  }
  const [top] = categoryBreakdown(txns, month, currency, "DEBIT", today);
  if (top && top.share < 1) {
    return { text: `${top.name} is ${formatPercent(top.share)} of your spending`, tone: "neutral" };
  }
  if (comparison.current > 0) return { text: "Your spending is steady compared with last month", tone: "neutral" };
  return null;
}

export interface DayGroup {
  day: string;
  items: Txn[];
  spent: number;
  received: number;
}

export function groupByDay(list: Txn[], currency: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of list) {
    let group = groups[groups.length - 1];
    if (!group || group.day !== t.day) {
      group = { day: t.day, items: [], spent: 0, received: 0 };
      groups.push(group);
    }
    group.items.push(t);
    if (counts(t, currency)) {
      if (t.type === "DEBIT") group.spent += t.minor;
      else group.received += t.minor;
    }
  }
  return groups;
}

/** Months that have data, newest first, always including the current month. */
export function availableMonths(txns: Txn[], currentMonth: string): string[] {
  return [...new Set([currentMonth, ...txns.map((t) => t.month)])].sort().reverse();
}

/** INR when present, otherwise the most used currency. */
export function preferredCurrency(txns: Txn[]): string {
  const tally = new Map<string, number>();
  for (const t of txns) if (t.is_parsed) tally.set(t.currency, (tally.get(t.currency) ?? 0) + 1);
  if (tally.has("INR") || tally.size === 0) return "INR";
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function currencies(txns: Txn[]): string[] {
  return [...new Set(txns.filter((t) => t.is_parsed).map((t) => t.currency))].sort();
}

/**
 * A merchant name as the server compares names (`categorize.merchant_key`): trimmed, runs of
 * whitespace as one space, lower case. null when there's no name, or it's "Unknown".
 */
export function merchantKey(name: string | null): string | null {
  const key = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return key && key !== "unknown" ? key : null;
}

export const parsedByLabel = (t: Pick<Transaction, "parsed_by" | "is_parsed">) =>
  !t.is_parsed
    ? "Needs review"
    : (
        {
          regex: "Bank SMS rules",
          "regex+ai": "Rules + AI category",
          "regex+user": "Rules + your category",
          "regex+history": "Rules + past payments",
          "regex+rule": "Rules + your category rule",
          ai_agent: "AI parsed",
          manual: "You, by hand",
          edited: "You, from the SMS",
        } as Record<string, string>
      )[
        t.parsed_by
      ] ?? t.parsed_by;
