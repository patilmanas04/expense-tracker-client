"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { needsReview, type DayGroup } from "@/lib/analytics";
import { SHADE_PERCENT, calendarCellsBetween, shadeStep } from "@/lib/calendar";
import { compactMoney, dayOfMonth, formatMoney, shortDayLabel, weekdayDayLabel } from "@/lib/format";

import { Card, IconButton, cx } from "./ui";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** From ₹10,000 a cell shows "₹12.3K" so it fits a phone-width column. */
const COMPACT_FROM = 1_000_000;

/**
 * Activity → Calendar: one month or one pay period (`first`…`last`), Monday-first, each day's spending shaded in
 * 4 steps against the month's largest day. Days up to today are buttons that list that day; later days are muted.
 * A pay period that crosses into another month shows "1 Nov" on that month's 1st.
 */
export function CalendarGrid({
  first,
  last,
  label,
  days,
  today,
  currency,
  selectedDay,
  canPrev,
  canNext,
  onPickDay,
  onMonth,
}: {
  first: string; // "YYYY-MM-DD", the month's (or pay period's) first day
  last: string; // its last day (the open pay period's expected last day)
  label: string; // "October 2026", or "Nov · 31 Oct – today" (monthTitle)
  days: DayGroup[]; // groupByDay over the month's rows
  today: string; // "YYYY-MM-DD"
  currency: string;
  selectedDay: string | null; // Activity's ON_DAY day, if any
  canPrev: boolean;
  canNext: boolean;
  onPickDay: (day: string) => void;
  onMonth: (delta: -1 | 1) => void;
}) {
  const cells = useMemo(() => calendarCellsBetween(first, last), [first, last]);
  const spans = first.slice(0, 7) !== last.slice(0, 7);
  const dayText = (day: string) => (spans && dayOfMonth(day) === 1 ? shortDayLabel(day) : dayOfMonth(day));
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const max = days.reduce((m, d) => Math.max(m, d.spent), 0);
  const totalSpent = days.reduce((s, d) => s + d.spent, 0);
  const count = days.reduce((s, d) => s + d.items.length, 0);
  const whole = (minor: number) => formatMoney(minor, currency, { decimals: false });

  return (
    <Card className="mt-5 p-3 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <IconButton
          label="Previous month"
          onClick={() => onMonth(-1)}
          disabled={!canPrev}
          className="disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft size={18} aria-hidden />
        </IconButton>
        <h2 aria-live="polite" className="min-w-0 truncate text-center text-[17px] font-semibold text-ink">
          {label}
        </h2>
        <IconButton
          label="Next month"
          onClick={() => onMonth(1)}
          disabled={!canNext}
          className="disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight size={18} aria-hidden />
        </IconButton>
      </div>
      <p className="mt-1 text-center text-[13px] text-ink-2">
        {days.length ? (
          <>
            <b className="font-semibold tabular-nums text-ink">{formatMoney(totalSpent, currency)}</b> spent · {count}{" "}
            {count === 1 ? "transaction" : "transactions"}
          </>
        ) : (
          `Nothing matches in ${label}`
        )}
      </p>

      <div aria-hidden className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div role="group" aria-label={`${label} calendar`} className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} aria-hidden />;
          if (day > today) {
            return (
              <div
                key={day}
                aria-hidden
                className="flex min-h-14 min-w-0 rounded-xl px-0.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink-3 sm:min-h-20 sm:p-2 sm:text-[13px]"
              >
                {dayText(day)}
              </div>
            );
          }
          const group = byDay.get(day);
          const spent = group?.spent ?? 0;
          const items = group?.items.length ?? 0;
          const review = !!group?.items.some(needsReview);
          const step = shadeStep(spent, max);
          const payments = items ? `${items} ${items === 1 ? "payment" : "payments"}` : "no payments";
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${weekdayDayLabel(day)}${day === today ? ", today" : ""}, ${whole(spent)} spent, ${payments}${review ? ", needs review" : ""}`}
              className={cx(
                // Phones: 2px sides and 10px amounts, so "₹9,999" and "₹76.2K" fit a 40px column at 360px.
                "relative flex min-h-14 min-w-0 flex-col items-start justify-between rounded-xl px-0.5 py-1 text-left transition sm:min-h-20 sm:p-2 focus-visible:outline-2 focus-visible:outline-violet",
                step ? null : "bg-surface",
                // text-ink is >= 6.1:1 on steps 0-3 in both themes; on step 4 light text drops below 4.5:1
                // in the dark theme, so the heaviest days use near-black there (on-shade equals ink in light).
                step === 4 ? "text-on-shade" : "text-ink",
                // Today: a violet ring outside the cell with a surface-coloured gap, so it sits on the card
                // (4.5:1 light, 5.7:1 dark) whatever the day's shade; inside, it would vanish on steps 3-4.
                // The 4px it spans fits in gap-1. Selected: an ink ring inside (>= 3.6:1 on every step),
                // a separate shadow layer, so a selected today shows both.
                day === today && "ring-2 ring-violet ring-offset-2 ring-offset-surface",
                day === selectedDay && "inset-ring-2 inset-ring-ink",
              )}
              style={
                step ? { backgroundColor: `color-mix(in srgb, var(--color-violet) ${SHADE_PERCENT[step]}%, transparent)` } : undefined
              }
            >
              <span className="text-[12px] font-medium whitespace-nowrap sm:text-[13px]">{dayText(day)}</span>
              {items ? (
                <span className="w-full min-w-0">
                  <span className="block w-full truncate text-[10px] font-semibold tabular-nums sm:text-[13px]">
                    {spent >= COMPACT_FROM ? compactMoney(spent, currency) : whole(spent)}
                  </span>
                  {spent === 0 ? (
                    <span className="block w-full truncate text-[10px] text-ink-2">
                      {items} {items === 1 ? "item" : "items"}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {review ? <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-warn" /> : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
