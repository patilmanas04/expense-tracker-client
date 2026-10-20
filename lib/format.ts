/** Dates are grouped in India Standard Time, matching the backend dashboard. */
export const TIME_ZONE = "Asia/Kolkata";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-21" in IST. */
export function dayKey(value: string | number | Date): string {
  return dayKeyFormat.format(new Date(value));
}

/** "2026-10" from a day key. */
export const monthOf = (day: string) => day.slice(0, 7);

export const dayOfMonth = (day: string) => Number(day.slice(8, 10));

// Noon IST keeps formatting on the intended calendar day in any viewer timezone.
const fromDay = (day: string) => new Date(`${day}T12:00:00+05:30`);

export function shiftDay(day: string, delta: number): string {
  return dayKey(fromDay(day).getTime() + delta * 86_400_000);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

const monthLong = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, month: "long", year: "numeric" });
const monthNameFormat = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, month: "long" });
const monthShort = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, month: "short" });

/** "October 2026" */
export const monthLabel = (month: string) => monthLong.format(fromDay(`${month}-01`));
/** "October" */
export const monthName = (month: string) => monthNameFormat.format(fromDay(`${month}-01`));
/** "Oct" */
export const monthShortName = (month: string) => monthShort.format(fromDay(`${month}-01`));

const dayParts = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "Monday, 12 January, 2026", or Today / Yesterday. */
export function dayHeading(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const parts = Object.fromEntries(dayParts.formatToParts(fromDay(day)).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month}, ${parts.year}`;
}

const longDate = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
/** "1 May 2026" */
export const longDayLabel = (day: string) => longDate.format(fromDay(day));

/** "Just now", "5m ago", "3h ago", "Yesterday", or "21 Oct". */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60 && dayKey(iso) === dayKey(now)) return `${Math.floor(minutes / 60)}h ago`;
  if (dayKey(iso) === shiftDay(dayKey(now), -1)) return "Yesterday";
  return shortDayLabel(dayKey(iso));
}

const shortDate = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
export const shortDayLabel = (day: string) => shortDate.format(fromDay(day));

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const timeLabel = (iso: string) => timeFormat.format(new Date(iso));

const fullDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const dateTimeLabel = (iso: string) => fullDateTime.format(new Date(iso));

/* ---------- Money: all arithmetic in minor units (paise) ---------- */

export const toMinor = (amount: number) => Math.round(amount * 100);

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, options: Intl.NumberFormatOptions = {}) {
  const key = `${currency}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency, ...options });
    } catch {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", ...options });
    }
    formatters.set(key, f);
  }
  return f;
}

/** "₹1,234.50"; `signed` prefixes "+" / "−" by direction. */
export function formatMoney(
  minor: number,
  currency: string,
  { decimals = true, signed = false }: { decimals?: boolean; signed?: boolean } = {},
): string {
  const digits = decimals ? 2 : 0;
  const text = formatter(currency, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Math.abs(minor) / 100,
  );
  const sign = minor < 0 ? "−" : signed && minor > 0 ? "+" : "";
  return sign + text;
}

/** Splits "₹42,124.67" into "₹42,124" and ".67" so decimals can be de-emphasised. */
export function moneyParts(minor: number, currency: string) {
  const parts = formatter(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(
    Math.abs(minor) / 100,
  );
  const decimalAt = parts.findIndex((p) => p.type === "decimal");
  const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join("");
  return decimalAt < 0
    ? { whole: join(parts), fraction: "" }
    : { whole: join(parts.slice(0, decimalAt)), fraction: join(parts.slice(decimalAt)) };
}

/**
 * Reads what someone typed into an amount field ("₹1,25,000.5", "-200") as a plain
 * decimal string ("125000.5"), or null when it isn't a valid amount with up to 2 decimals.
 */
export function parseAmountInput(text: string): string | null {
  const cleaned = text.replace(/[₹,\s]/g, "").replace(/^\+/, "");
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return null;
  return cleaned;
}

/** Axis ticks and tight spaces: "₹1.5K", "₹2.4L". */
export function compactMoney(minor: number, currency: string): string {
  return formatter(currency, { notation: "compact", maximumFractionDigits: 1 }).format(minor / 100);
}

/** 0.248 -> "24.8%", 0.31 -> "31%" */
export function formatPercent(fraction: number): string {
  const value = fraction * 100;
  const digits = value !== 0 && Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0;
  return `${Number(value.toFixed(digits))}%`;
}
