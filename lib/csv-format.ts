// No imports: scripts/check-csv.mjs imports this file with Node.

/** One cell: `text` cells get the spreadsheet formula guard; numbers, dates and times don't. */
export interface CsvCell {
  value: string;
  text: boolean;
}

/**
 * One RFC 4180 cell. A text cell starting with = + - @ TAB or CR gets a leading ' so a spreadsheet
 * never runs it as a formula; then a value with " , CR or LF is quoted, with each " doubled.
 */
export function csvCell(value: string, text: boolean): string {
  const guarded = text && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** UTF-8 with a BOM (so Excel reads ₹ and Devanagari), every record ending with CRLF, the last one too. */
export function toCsv(rows: CsvCell[][]): string {
  return "﻿" + rows.map((row) => row.map((c) => csvCell(c.value, c.text)).join(",") + "\r\n").join("");
}

/** Paise as "1234.50": exact, never negative, two decimals, no separators. */
export function amountCell(minor: number): string {
  const m = Math.abs(Math.round(minor));
  return `${Math.floor(m / 100)}.${String(m % 100).padStart(2, "0")}`;
}

/** "Food & Dining" → "food-dining", "दिल्ली" stays "दिल्ली": letters, marks and digits of any script, runs of anything else become "-". */
export function slugPart(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Code points kept of "folio-<parts>", before "-<today>.csv". */
export const FILE_STEM_MAX = 80;

/** Activity's filters that name the file. Search text and the amount filter never do. */
export interface ExportFilters {
  /** A month ("YYYY-MM"), a day, a range (either end optional), or null for all time. */
  period: { month: string } | { day: string } | { from?: string; to?: string } | null;
  category: string | null;
  tags: string[];
  /** Activity's KindFilter: "ALL" | "DEBIT" | "CREDIT" | "REVIEW". */
  kind: string;
}

const KIND_PARTS: Record<string, string> = { REVIEW: "review", DEBIT: "debits", CREDIT: "credits" };

function periodPart(period: ExportFilters["period"]): string | null {
  if (!period) return null;
  if ("month" in period) return period.month;
  if ("day" in period) return period.day;
  const { from, to } = period;
  if (from && to) return from === to ? from : `${from}-to-${to}`;
  if (from) return `from-${from}`;
  if (to) return `until-${to}`;
  return null;
}

/** "folio-2026-10-travel-2026-11-18.csv": the period, category, tags and kind, then today (IST). */
export function fileName(filters: ExportFilters, today: string): string {
  const parts = [periodPart(filters.period), filters.category, ...filters.tags, KIND_PARTS[filters.kind] ?? null]
    .map((part) => (part ? slugPart(part) : ""))
    .filter(Boolean);
  const stem = Array.from(["folio", ...parts].join("-"))
    .slice(0, FILE_STEM_MAX)
    .join("")
    .replace(/-+$/, "");
  return `${stem}-${today}.csv`;
}
