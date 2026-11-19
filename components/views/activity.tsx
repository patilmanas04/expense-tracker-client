"use client";

import { CalendarDays, Check, Download, Hash, Plus, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { counts, groupByDay, monthTitle, needsReview, tripSummary, type MonthCalendar, type Txn } from "@/lib/analytics";
import { categoryMeta, categoryName } from "@/lib/categories";
import { transactionsCsv } from "@/lib/csv";
import { fileName, type ExportFilters } from "@/lib/csv-format";
import {
  dayKey,
  dayRangeLabel,
  formatMoney,
  parseAmountInput,
  shiftMonth,
  shortDayLabel,
  toMinor,
} from "@/lib/format";
import { saveFile } from "@/lib/save-file";
import { allTags, tagQuery } from "@/lib/tags";

import { AddTransactionSheet } from "../add-transaction";
import { CalendarGrid } from "../calendar-grid";
import { useData, type KindFilter } from "../data-provider";
import { MoreFiltersSheet } from "../more-filters-sheet";
import { TransactionGroups } from "../transactions";
import { Card, IconButton, Segmented, SelectPill, cx } from "../ui";

const PAGE = 50;
const ALL = "ALL";
// Period choices besides "All time" and the months ("YYYY-MM").
const TODAY = "today";
const YESTERDAY = "yesterday";
const ON_DAY = "on-day";
/** A from/to range of days, either end optional. */
const RANGE = "range";

/** IST "YYYY-MM-DD" days, both inclusive. */
type DayRange = { from?: string; to?: string };

/** Whether a transaction falls in the chosen period; days are India time, like the rest of the app. */
function inPeriod(t: Txn, period: string, day: string, range: DayRange, today: string, yesterday: string) {
  switch (period) {
    case ALL:
      return true;
    case TODAY:
      return t.day === today;
    case YESTERDAY:
      return t.day === yesterday;
    case ON_DAY:
      return t.day === day;
    case RANGE:
      return (!range.from || t.day >= range.from) && (!range.to || t.day <= range.to);
    default:
      return t.period === period;
  }
}

/** The chosen period for the export's file name. */
function exportPeriod(period: string, day: string, range: DayRange, today: string, yesterday: string): ExportFilters["period"] {
  switch (period) {
    case ALL:
      return null;
    case TODAY:
      return { day: today };
    case YESTERDAY:
      return { day: yesterday };
    case ON_DAY:
      return day ? { day } : null;
    case RANGE:
      return { from: range.from, to: range.to };
    default:
      return { month: period };
  }
}

/**
 * The calendar's month (or pay period): a month period's own month; a picked day's month (today's until one is
 * picked); a range's start month (else its end's, else today's); the current month for All time, Today and Yesterday.
 */
function calendarMonthFor(period: string, day: string, range: DayRange, today: string, cal: MonthCalendar): string {
  switch (period) {
    case ALL:
    case TODAY:
    case YESTERDAY:
      return cal.current;
    case ON_DAY:
      return cal.monthOf(day || today);
    case RANGE:
      return cal.monthOf(range.from ?? range.to ?? today);
    default:
      return period;
  }
}

/** List or Calendar, remembered for the visit (sessionStorage); memory only where storage throws. */
type View = "list" | "calendar";
const VIEW_KEY = "folio.activity.view";
const viewListeners = new Set<() => void>();
let viewMemory: View | null = null; // when sessionStorage is unavailable

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  return () => {
    viewListeners.delete(listener);
  };
}

function readView(): View {
  if (viewMemory) return viewMemory;
  try {
    return sessionStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}

function writeView(view: View) {
  viewMemory = view;
  try {
    sessionStorage.setItem(VIEW_KEY, view);
  } catch {
    // private mode: memory only
  }
  for (const listener of viewListeners) listener();
}

/** What's typed in More filters' amount boxes ("2,000.50"), as typed. */
export type AmountText = { min: string; max: string };
/** Bounds in rupees; while there's an error there are none (the filter is off until it's fixed). */
type AmountFilter = { min?: number; max?: number; error: string | null };

function readAmountFilter(text: AmountText): AmountFilter {
  const read = (s: string) => {
    if (!s.trim()) return undefined;
    const value = parseAmountInput(s);
    return value === null || value.startsWith("-") ? null : Number(value);
  };
  const min = read(text.min);
  const max = read(text.max);
  if (min === null || max === null) return { error: "Enter amounts like 2000 or 2,000.50" };
  if (min !== undefined && max !== undefined && min > max) return { error: "At least is more than At most" };
  return { min, max, error: null };
}

/** The row's own amount, in its own currency. Unreadable SMS (no real amount) never match a bound. */
function inAmount(t: Txn, f: AmountFilter) {
  if (f.min === undefined && f.max === undefined) return true;
  return t.is_parsed && (f.min === undefined || t.minor >= toMinor(f.min)) && (f.max === undefined || t.minor <= toMinor(f.max));
}

/** Everything the search box matches against, lower case. */
const searchText = (t: Txn) =>
  [t.merchant, categoryName(t), t.notes, t.account_ref, t.reference_id, t.sender, t.raw_message, t.amount.toFixed(2)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

interface ActiveFilters {
  period: string;
  day: string;
  range: DayRange;
  today: string;
  yesterday: string;
  kind: KindFilter;
  category: string;
  /** From the Tags pill, a chip or a link. */
  tag: string | null;
  /** The search box holding exactly one tag ("#goa"); it then filters by tag instead of text. */
  searchTag: string | null;
  text: string;
  amount: AmountFilter;
}

/** Every filter applies together (AND). `haystack` is the row's `searchText`. */
function matches(t: Txn, f: ActiveFilters, haystack: string) {
  return inPeriod(t, f.period, f.day, f.range, f.today, f.yesterday) && matchesExceptPeriod(t, f, haystack);
}

/** Every filter but the period: the calendar picks its own month. The kind ("Refund expected" too) is here, so the calendar gets it as well. */
function matchesExceptPeriod(t: Txn, f: ActiveFilters, haystack: string) {
  return (
    (f.kind === "ALL" ||
      (f.kind === "REVIEW" ? needsReview(t) : f.kind === "REFUND" ? t.refund === "expected" : t.is_parsed && t.type === f.kind)) &&
    (f.category === ALL || (t.is_parsed && categoryName(t) === f.category)) &&
    (!f.tag || t.tags.includes(f.tag)) &&
    (!f.searchTag || t.tags.includes(f.searchTag)) &&
    inAmount(t, f.amount) &&
    (!f.text || haystack.includes(f.text))
  );
}

/** "1–15 Oct", "From 1 Oct", "Until 15 Oct" or "Date range…". */
function rangeLabel(range: DayRange) {
  if (range.from && range.to) return dayRangeLabel(range.from, range.to);
  if (range.from) return `From ${shortDayLabel(range.from)}`;
  if (range.to) return `Until ${shortDayLabel(range.to)}`;
  return "Date range…";
}

/** "₹2,000–₹5,000", "At least ₹2,000", "At most ₹5,000", or null with no bounds. */
function amountLabel(f: AmountFilter, currency: string) {
  const money = (x: number) => formatMoney(toMinor(x), currency, { decimals: !Number.isInteger(x) });
  if (f.min !== undefined && f.max !== undefined) return `${money(f.min)}–${money(f.max)}`;
  if (f.min !== undefined) return `At least ${money(f.min)}`;
  if (f.max !== undefined) return `At most ${money(f.max)}`;
  return null;
}

export function ActivityView() {
  const { txns, months, currency, today, cal, activityRequest } = useData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [category, setCategory] = useState(ALL);
  const [period, setPeriod] = useState(ALL);
  const [day, setDay] = useState(""); // "YYYY-MM-DD" for "Pick a date"
  const [range, setRange] = useState<DayRange>({}); // for "Date range…"
  const [tag, setTag] = useState<string | null>(null);
  const [amountText, setAmountText] = useState<AmountText>({ min: "", max: "" });
  const [moreOpen, setMoreOpen] = useState(false);
  const yesterday = today ? dayKey(Date.parse(`${today}T12:00:00+05:30`) - 86_400_000) : "";
  const dateRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(PAGE);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Txn | null>(null);
  const [exporting, setExporting] = useState(false); // while the share sheet is open
  // Stable, so a live update re-rendering this page doesn't reset focus inside the open sheet.
  const closeAdd = useCallback(() => setAdding(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Another screen asked for a filtered view (e.g. a category card, a tag chip or a notification).
  // A request's `txn` (open that transaction) is handled by the provider when the request is made.
  if (activityRequest && activityRequest.nonce !== appliedNonce) {
    setAppliedNonce(activityRequest.nonce);
    const request = activityRequest;
    if (request.kind || request.category || request.month || request.tag) {
      setKind(request.kind ?? "ALL");
      setCategory(request.category ?? ALL);
      setPeriod(request.month ?? ALL);
      setTag(request.tag ?? null);
      setDay("");
      setRange({});
      setAmountText({ min: "", max: "" });
      setQuery("");
    }
    setVisible(PAGE);
  }

  useEffect(() => {
    if (activityRequest?.focusSearch) searchRef.current?.focus();
  }, [activityRequest]);

  const searchable = useMemo(() => new Map(txns.map((t) => [t.id, searchText(t)])), [txns]);
  const tags = useMemo(() => allTags(txns), [txns]);
  const searchTag = tagQuery(query);
  const amount = useMemo(() => readAmountFilter(amountText), [amountText]);
  const filters = useMemo<ActiveFilters>(
    () => ({
      period,
      day,
      range,
      today,
      yesterday,
      kind,
      category,
      tag,
      searchTag,
      text: searchTag ? "" : query.trim().toLowerCase(),
      amount,
    }),
    [period, day, range, today, yesterday, kind, category, tag, searchTag, query, amount],
  );

  const categoryOptions = useMemo(
    () => [...new Set(txns.filter((t) => t.is_parsed).map(categoryName))].sort((a, b) => a.localeCompare(b)),
    [txns],
  );

  const reviewCount = useMemo(() => txns.filter(needsReview).length, [txns]);
  const refundCount = useMemo(() => txns.filter((t) => t.refund === "expected").length, [txns]);

  const filteredExceptPeriod = useMemo(
    () => txns.filter((t) => matchesExceptPeriod(t, filters, searchable.get(t.id) ?? "")),
    [txns, filters, searchable],
  );
  const filtered = useMemo(
    () => filteredExceptPeriod.filter((t) => inPeriod(t, period, day, range, today, yesterday)),
    [filteredExceptPeriod, period, day, range, today, yesterday],
  );

  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const calMonth = today ? calendarMonthFor(period, day, range, today, cal) : "";
  const calDays = useMemo(
    () => (view === "calendar" && calMonth ? groupByDay(filteredExceptPeriod.filter((t) => t.period === calMonth), currency) : []),
    [view, calMonth, filteredExceptPeriod, currency],
  );
  const oldestMonth = months[months.length - 1] ?? calMonth;
  const canPrev = !!calMonth && calMonth > oldestMonth;
  const canNext = !!today && calMonth < cal.current;
  // An arrow can land on a month with no data; the Period menu still lists it then.
  const monthOptions = /^\d{4}-\d{2}$/.test(period) && !months.includes(period) ? [...months, period].sort().reverse() : months;

  // The confirmation under the header fades after a few seconds.
  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(null), 4000);
    return () => window.clearTimeout(id);
  }, [added]);

  const summary = useMemo(() => {
    let spent = 0;
    let received = 0;
    for (const t of filtered) {
      if (!counts(t, currency)) continue;
      if (t.type === "DEBIT") spent += t.counted;
      else received += t.counted;
    }
    return { spent, received };
  }, [filtered, currency]);

  // A tag (picked, or searched as "#goa") reads as a trip: its dates and where the money went.
  const tripTag = tag ?? searchTag;
  const trip = useMemo(() => (tripTag ? tripSummary(filtered, currency) : null), [tripTag, filtered, currency]);

  // Render long histories progressively as the list scrolls.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible((v) => v + PAGE),
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, view]); // back from Calendar, the sentinel is a new element

  const resetFilters = () => {
    setQuery("");
    setKind("ALL");
    setCategory(ALL);
    setPeriod(ALL);
    setDay("");
    setRange({});
    setTag(null);
    setAmountText({ min: "", max: "" });
  };

  const choosePeriod = (value: string) => {
    setVisible(PAGE);
    if (value !== ON_DAY) return setPeriod(value);
    setDay((current) => current || today); // until you pick a date, it shows today's
    setPeriod(ON_DAY);
    try {
      dateRef.current?.showPicker(); // open the date picker straight away where the browser allows it
    } catch {
      // not supported here: the calendar button next to the menu opens it
    }
  };
  // The calendar's arrows move Activity's month, so List and Calendar always show the same one.
  const moveMonth = (delta: -1 | 1) => {
    setPeriod(shiftMonth(calMonth, delta));
    setVisible(PAGE);
  };
  // Tapping a day lists it. The day's button goes away with the calendar, so focus moves to the list
  // (listBlock, when it mounts) instead of falling to <body>.
  const focusListNext = useRef(false);
  const listBlock = useCallback((node: HTMLDivElement | null) => {
    if (node && focusListNext.current) {
      focusListNext.current = false;
      node.focus();
    }
  }, []);
  const pickDay = (d: string) => {
    focusListNext.current = true;
    setDay(d);
    setPeriod(ON_DAY);
    setVisible(PAGE);
    writeView("list");
  };

  const filtersActive =
    query ||
    kind !== "ALL" ||
    category !== ALL ||
    period !== ALL ||
    tag !== null ||
    amountText.min.trim() ||
    amountText.max.trim();

  const onAdded = (txn: Txn) => {
    setAdded(txn);
    // Don't let the current filters hide what you just added.
    if (!matches(txn, filters, searchText(txn))) resetFilters();
    setVisible(PAGE);
  };

  // One side of "Date range…"; empty leaves that end open, and a start after the end swaps them.
  const changeRange = (side: keyof DayRange, value: string) => {
    const next: DayRange = { ...range, [side]: value || undefined };
    if (next.from && next.to && next.from > next.to) [next.from, next.to] = [next.to, next.from];
    setRange(next);
    setVisible(PAGE);
  };
  const amountPill = amountLabel(amount, currency);

  // Saves exactly the listed transactions (all of them, not only the rendered ones) as a CSV file.
  // Search text and the amount filter aren't part of the file name.
  const exportCsv = async () => {
    if (!filtered.length) return;
    const exportDay = today || dayKey(Date.now()); // in a click handler, not during render
    const name = fileName(
      {
        period: exportPeriod(period, day, range, exportDay, yesterday),
        category: category === ALL ? null : category,
        tags: [...new Set([tag, searchTag].filter((t): t is string => !!t))],
        kind,
      },
      exportDay,
    );
    const text = transactionsCsv(filtered); // built before any await, so the share keeps the tap's permission
    setExporting(true);
    try {
      await saveFile(text, name, "text/csv");
    } finally {
      setExporting(false);
    }
  };

  const chips: { value: KindFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "DEBIT", label: "Expenses" },
    { value: "CREDIT", label: "Income" },
    { value: "REVIEW", label: "Needs review" },
    // Only while a refund is expected, or while chosen (so it doesn't vanish under you when the last one closes).
    ...(refundCount || kind === "REFUND" ? [{ value: "REFUND" as const, label: "Refund expected" }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-safe sm:px-6 lg:px-8 lg:pt-8">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="shrink-0 text-[22px] font-semibold tracking-tight text-ink lg:text-3xl">Activity</h1>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm text-ink-2">
            {filtered.length} of {txns.length}
          </p>
          <IconButton
            label="Export CSV"
            onClick={exportCsv}
            disabled={filtered.length === 0 || exporting}
            className="disabled:pointer-events-none disabled:opacity-40"
          >
            <Download size={18} aria-hidden />
          </IconButton>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-haspopup="dialog"
            className="flex h-10 items-center gap-1.5 rounded-full bg-ink pr-4 pl-3 text-sm font-semibold text-canvas transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            <Plus size={18} strokeWidth={2.4} aria-hidden /> Add
          </button>
        </div>
      </header>

      {added ? (
        <p role="status" className="animate-fade mt-3 flex items-center gap-2 rounded-2xl bg-income-soft px-4 py-2.5 text-sm font-medium text-income">
          <Check size={16} aria-hidden />
          <span className="truncate">
            Added {added.merchant} · {formatMoney(added.type === "DEBIT" ? -added.minor : added.minor, added.currency, { signed: true })}
          </span>
        </p>
      ) : null}

      <div className="relative mt-4">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(PAGE);
          }}
          placeholder="Search transactions"
          aria-label="Search transactions"
          className="h-12 w-full rounded-full border border-line bg-surface pr-11 pl-11 text-[16px] text-ink shadow-card outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-track"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* Wraps inside the page padding instead of scrolling, so chips never meet the screen edge. */}
      <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            role="radio"
            aria-checked={kind === chip.value}
            onClick={() => {
              setKind(chip.value);
              setVisible(PAGE);
            }}
            className={cx(
              "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium transition",
              kind === chip.value ? "bg-ink text-canvas" : "border border-line bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {chip.label}
            {chip.value === "REVIEW" && reviewCount ? (
              <span className={cx("rounded-full px-1.5 text-[11px] leading-4", kind === "REVIEW" ? "bg-canvas/20" : "bg-warn-soft text-warn")}>
                {reviewCount}
              </span>
            ) : null}
            {chip.value === "REFUND" && refundCount ? (
              <span className={cx("rounded-full px-1.5 text-[11px] leading-4", kind === "REFUND" ? "bg-canvas/20" : "bg-violet-soft text-violet-strong")}>
                {refundCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <SelectPill
          size="sm"
          label="Period"
          value={period}
          onChange={choosePeriod}
          options={[
            { value: ALL, label: "All time" },
            { value: TODAY, label: "Today" },
            { value: YESTERDAY, label: "Yesterday" },
            { value: ON_DAY, label: period === ON_DAY && day ? `On ${shortDayLabel(day)}` : "Pick a date…" },
            { value: RANGE, label: period === RANGE ? rangeLabel(range) : "Date range…" },
            ...monthOptions.map((m) => ({ value: m, label: monthTitle(cal, m) })),
          ]}
        />
        {/* The date for "Pick a date". Always in the page so the menu can open its picker. */}
        <label
          title="Pick another date"
          // Hidden but still in the page when not in use, so it takes no room in the row. Only
          // `sr-only` then: its size and position classes would otherwise win and leave a gap.
          className={
            period === ON_DAY
              ? "relative grid size-8 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink shadow-card focus-within:ring-2 focus-within:ring-violet/40"
              : "sr-only"
          }
        >
          <CalendarDays size={15} aria-hidden />
          <input
            ref={dateRef}
            type="date"
            aria-label="Pick a date"
            tabIndex={period === ON_DAY ? 0 : -1}
            value={day}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return;
              setDay(e.target.value);
              setPeriod(ON_DAY);
              setVisible(PAGE);
            }}
            className="absolute inset-0 cursor-pointer text-base opacity-0"
          />
        </label>
        <SelectPill
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setVisible(PAGE);
          }}
          options={[{ value: ALL, label: "All categories" }, ...categoryOptions.map((c) => ({ value: c, label: c }))]}
          size="sm"
          className="max-w-full"
        />
        {tags.length || tag !== null ? (
          <SelectPill
            label="Tags"
            value={tag ?? ALL}
            onChange={(v) => {
              setTag(v === ALL ? null : v);
              setVisible(PAGE);
            }}
            options={[
              { value: ALL, label: "All tags" },
              ...tags.map((t) => ({ value: t.tag, label: `#${t.tag} (${t.count})` })),
              // A tag from a link that no note has (any more) still shows, so it can be cleared.
              ...(tag !== null && !tags.some((t) => t.tag === tag) ? [{ value: tag, label: `#${tag} (0)` }] : []),
            ]}
            size="sm"
            className="max-w-full"
          />
        ) : null}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition hover:bg-raised focus-visible:outline-2 focus-visible:outline-violet"
        >
          <SlidersHorizontal size={14} className="shrink-0" aria-hidden />
          {amount.error ? (
            <span className="truncate text-warn">Fix amount</span>
          ) : (
            <span className="truncate">{amountPill ?? "More filters"}</span>
          )}
        </button>
        {filtersActive ? (
          <button type="button" onClick={resetFilters} className="h-8 rounded-full px-3 text-[13px] font-medium text-violet-strong hover:bg-violet-soft">
            Reset
          </button>
        ) : null}
      </div>

      {period === RANGE ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["from", "to"] as const).map((side) => (
            <label key={side} className="min-w-0">
              <span className="mb-1 block px-1 text-xs text-ink-2">{side === "from" ? "From" : "To"}</span>
              <input
                type="date"
                value={range[side] ?? ""}
                max={today}
                onChange={(e) => changeRange(side, e.target.value)}
                className="h-10 w-full min-w-0 rounded-full border border-line bg-surface px-3 text-[16px] text-ink shadow-card outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
              />
            </label>
          ))}
        </div>
      ) : null}

      <Segmented
        label="View"
        className="mt-4 sm:max-w-xs"
        value={view}
        onChange={writeView}
        options={[
          { value: "list", label: "List" },
          { value: "calendar", label: "Calendar" },
        ]}
      />

      {view === "calendar" ? (
        calMonth ? (
          <CalendarGrid
            first={cal.first(calMonth)}
            last={cal.last(calMonth)}
            label={monthTitle(cal, calMonth)}
            days={calDays}
            today={today}
            currency={currency}
            selectedDay={period === ON_DAY ? day || null : null}
            canPrev={canPrev}
            canNext={canNext}
            onPickDay={pickDay}
            onMonth={moveMonth}
          />
        ) : null
      ) : (
        <>
          {filtered.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Card className="px-4 py-3">
                <p className="text-xs text-ink-2">Spent</p>
                <p className="mt-0.5 truncate text-lg font-semibold text-ink tabular-nums">{formatMoney(summary.spent, currency)}</p>
              </Card>
              <Card className="px-4 py-3">
                <p className="text-xs text-ink-2">Received</p>
                <p className="mt-0.5 truncate text-lg font-semibold text-income tabular-nums">{formatMoney(summary.received, currency)}</p>
              </Card>
            </div>
          ) : null}

          {filtered.length > 0 && trip && tripTag ? (
            <Card className="mt-3 px-4 py-3">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                <Hash size={14} className="shrink-0 text-violet-strong" aria-hidden />
                <span className="sr-only">Tag </span>
                <span className="truncate">{tripTag}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {dayRangeLabel(trip.from, trip.to)} ({trip.days} {trip.days === 1 ? "day" : "days"})
              </p>
              {trip.top.length ? (
                <ul className="mt-2 space-y-1.5" aria-label="Top categories">
                  {trip.top.map((c) => (
                    <li key={c.name} className="flex min-w-0 items-center gap-2 text-[13px]">
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryMeta(c.name).color }} />
                      <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                      <span className="shrink-0 font-semibold text-ink tabular-nums">{formatMoney(c.minor, currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <div ref={listBlock} tabIndex={-1} className="mt-6 outline-none">
            {filtered.length === 0 ? (
              <Card className="flex flex-col items-center p-8 text-center">
                <SearchX size={28} className="text-ink-3" aria-hidden />
                <p className="mt-3 font-medium text-ink">
                  {txns.length === 0
                    ? "No transactions yet"
                    : kind === "REVIEW"
                      ? "Nothing needs review"
                      : kind === "REFUND"
                        ? "No refunds expected"
                        : "No matching transactions"}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {txns.length === 0
                    ? "Bank SMS forwarded by your iPhone Shortcut will show up here. Paid in cash? Tap Add."
                    : kind === "REVIEW"
                      ? "No unreadable SMS or possible duplicates."
                      : kind === "REFUND"
                        ? "Open a payment and tap “Expect a refund” to keep track of it."
                        : "Try a different search or filter."}
                </p>
                {filtersActive && txns.length > 0 ? (
                  <button type="button" onClick={resetFilters} className="mt-4 h-10 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
                    Clear filters
                  </button>
                ) : null}
              </Card>
            ) : (
              <>
                <TransactionGroups items={filtered.slice(0, visible)} />
                {visible < filtered.length ? <div ref={sentinelRef} className="h-10" aria-hidden /> : null}
              </>
            )}
          </div>
        </>
      )}

      {adding ? <AddTransactionSheet onClose={closeAdd} onAdded={onAdded} /> : null}
      {moreOpen ? (
        <MoreFiltersSheet
          amountText={amountText}
          error={amount.error}
          onChange={(next) => {
            setAmountText(next);
            setVisible(PAGE);
          }}
          onClose={closeMore}
        />
      ) : null}
    </div>
  );
}
