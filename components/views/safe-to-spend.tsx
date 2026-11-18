"use client";

import { CalendarClock, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ApiError, getSafeToSpend } from "@/lib/api";
import { decimalMoney, formatMoney, shiftDay, shortDayLabel, toMinor } from "@/lib/format";
import type { Balance, SafeItem, SafeNote, SafeToSpend } from "@/lib/types";

import { useData } from "../data-provider";
import { lockPageScroll, useSheetDrag } from "../sheet-drag";
import { Card, cx, IconTile } from "../ui";
import { KIND_TEXT, UPCOMING_PAGE, whenLabel } from "./upcoming";

/** A fetch's outcome, kept with the balance, day and attempt it was made for. */
type Result = {
  balance: Balance;
  today: string;
  attempt: number;
  data: SafeToSpend | null;
  error: string | null;
  /** The server has no balance saved (404). */
  missing: boolean;
};

const REASON_TEXT: Record<SafeNote, string> = {
  card_or_cash: "On a card or cash",
  paid: "Paid",
  not_seen: "No payment seen",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The server's decimal strings ("-3200.00") in paise. */
const minor = (amount: string) => toMinor(Number(amount));

/** Paise as money, decimals only when there are paise: "₹3,500". */
const money = (paise: number, currency: string) => formatMoney(paise, currency, { decimals: paise % 100 !== 0 });

/** "1 Dec", with the year when it isn't this year (IST), as on Upcoming. */
const dayLabel = (day: string, today: string) =>
  !today || day.slice(0, 4) === today.slice(0, 4) ? shortDayLabel(day) : `${shortDayLabel(day)} ${day.slice(0, 4)}`;

/** "₹17,000", or "₹3,200 short before payday" when what's due is more than Balance left. */
const headlineText = (data: SafeToSpend) => {
  const safe = minor(data.safe);
  return safe < 0 ? `${money(-safe, data.currency)} short before payday` : money(safe, data.currency);
};

/** The line under the headline: the per-day figure and how long until payday (or the end of the month). */
function lineText(data: SafeToSpend, today: string): string {
  const payday = dayLabel(data.next_payday, today);
  const days = data.days ?? 0;
  const perDay = data.per_day === null ? null : decimalMoney(data.per_day, data.currency);
  switch (data.payday_state) {
    case "upcoming":
      if (perDay === null) return `${plural(days, "day", "days")} until payday (${payday})`;
      if (days > 1) return `about ${perDay} a day for ${days} days until payday (${payday})`;
      return `for today; payday is tomorrow (${payday})`;
    case "month_end":
      if (perDay === null) return `${plural(days, "day", "days")} to the end of the month`;
      if (days > 1) return `about ${perDay} a day for ${days} days, to the end of the month`;
      return "for today, the last day of the month";
    case "today":
      return "Salary expected today";
    case "late":
      return `Salary expected since ${payday}`;
  }
}

function subheadingText(data: SafeToSpend, today: string): string {
  if (data.payday_state === "upcoming") return `Due before payday (${dayLabel(data.next_payday, today)})`;
  if (data.payday_state === "month_end") return `Due by the end of the month (${dayLabel(shiftDay(data.next_payday, -1), today)})`;
  return "Due by today";
}

function footnoteText(data: SafeToSpend, today: string): string {
  switch (data.payday_state) {
    case "upcoming":
      return "Payday is worked out from your usual salary date (category Salary).";
    case "today":
      return "Your salary usually arrives today, so only what's due by today is subtracted.";
    case "late":
      return `Your salary usually arrives by ${dayLabel(data.next_payday, today)} and hasn't been seen yet, so only what's due by today is subtracted.`;
    case "month_end":
      return "Fewer than 2 salaries (category Salary) in the last 120 days, so this runs to the end of the month.";
  }
}

/**
 * "Tomorrow · auto-debit", plus " · late?" for an expected payment past its date, and for card bills what's
 * left after card payments and the minimum ("· ₹3,500 left of ₹4,500 (minimum ₹500 paid)").
 * `withAmount` adds the amount (the Not subtracted list, which has the reason on the right instead).
 */
function detailText(item: SafeItem, today: string, currency: string, withAmount: boolean): string {
  let text = `${whenLabel(item, today)} · ${KIND_TEXT[item.kind]}`;
  if (item.status === "late") text += " · late?";
  const amount = minor(item.amount);
  const paid = minor(item.paid_amount);
  const leftOf = item.kind === "card_bill" && paid > 0;
  // A card bill with payments already says "of ₹4,500", so the amount isn't repeated.
  if (withAmount && !leftOf) text += ` · ${money(amount, currency)}`;
  if (item.kind !== "card_bill") return text;
  if (leftOf) text += ` · ${money(Math.max(amount - paid, 0), currency)} left of ${money(amount, currency)}`;
  if (item.min_amount !== null) {
    const min = money(minor(item.min_amount), currency);
    text += paid >= minor(item.min_amount) ? ` (minimum ${min} paid)` : ` (minimum ${min})`;
  }
  return text;
}

const itemKey = (item: SafeItem, index: number) => `${item.kind}:${item.payee}:${item.date}:${index}`;

const ROW =
  "flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet";

/**
 * Settings → Bank balance → Safe to spend: Balance left minus what's still due from the bank before the
 * next payday, with a per-day figure. Tap it for the breakdown. Fetched when Settings opens and again when
 * the balance or the day changes (the 5-second poll replaces the balance only when it changed); the old
 * figures stay on screen meanwhile. Hidden with no balance saved.
 */
export function SafeToSpendRow() {
  const { balance, today } = useData();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!balance) return;
    let cancelled = false;
    getSafeToSpend().then(
      (data) => {
        if (!cancelled) setResult({ balance, today, attempt, data, error: null, missing: false });
      },
      (err: unknown) => {
        if (cancelled) return;
        const missing = err instanceof ApiError && err.status === 404;
        const error = missing ? null : (err instanceof Error && err.message) || "Couldn't work out Safe to spend.";
        setResult((current) => ({ balance, today, attempt, data: missing ? null : (current?.data ?? null), error, missing }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [balance, today, attempt]);

  if (!balance || result?.missing) return null;

  if (!result) {
    return (
      // Shaped like the loaded row (label, headline, per-day line) so nothing below moves when it loads. Each bar
      // sits in a line of the same text size, so the lines are as tall as the row's; on phones the per-day line
      // usually wraps, hence the extra bar there.
      <div className="flex min-h-16 items-center gap-3.5 px-4 py-3" aria-label="Working out Safe to spend">
        <span className="size-10 shrink-0 animate-pulse rounded-2xl bg-canvas" aria-hidden />
        <span className="min-w-0 flex-1" aria-hidden>
          <span className="block text-[13px]">
            <span className="inline-block h-3 w-24 animate-pulse rounded-full bg-canvas align-middle" />
          </span>
          <span className="block text-[17px]">
            <span className="inline-block h-[18px] w-40 max-w-full animate-pulse rounded-full bg-canvas align-middle" />
          </span>
          <span className="block text-[13px]">
            <span className="inline-block h-3 w-56 max-w-full animate-pulse rounded-full bg-canvas align-middle" />
          </span>
          <span className="block text-[13px] sm:hidden">
            <span className="inline-block h-3 w-28 max-w-full animate-pulse rounded-full bg-canvas align-middle" />
          </span>
        </span>
      </div>
    );
  }

  const data = result.data;
  if (!data) {
    const retrying = result.attempt !== attempt;
    return (
      <div className="flex min-h-16 items-center gap-3.5 px-4 py-3">
        <IconTile icon={CalendarClock} color="#8458F5" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-2">Safe to spend</p>
          <p className="text-[15px] text-ink">Couldn&apos;t work it out.</p>
        </div>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          disabled={retrying}
          className="flex h-10 shrink-0 items-center rounded-full bg-violet-soft px-4 text-sm font-medium text-violet-strong hover:bg-violet/15 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60"
        >
          {retrying ? "Trying…" : "Try again"}
        </button>
      </div>
    );
  }

  const short = minor(data.safe) < 0;
  return (
    // A wrapper so the sheet isn't one of the Card's divided rows.
    <div>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={ROW}>
        <IconTile icon={CalendarClock} color="#8458F5" size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink-2">Safe to spend</span>
          <span className={cx("block text-[17px] font-semibold break-words tabular-nums", short ? "text-expense" : "text-ink")}>
            {headlineText(data)}
          </span>
          <span className="block text-[13px] text-ink-2">{lineText(data, today)}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
      </button>
      {open ? <SafeToSpendSheet data={data} today={today} onClose={close} /> : null}
    </div>
  );
}

/** The breakdown: Balance left, what's subtracted, the result, and what isn't subtracted and why. */
function SafeToSpendSheet({ data, today, onClose }: { data: SafeToSpend; today: string; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockPageScroll();
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const { currency } = data;
  const safe = minor(data.safe);
  const subtracted = data.due.map((item, index) => ({ item, index })).filter(({ item }) => item.note === null);
  const notSubtracted = data.due.flatMap((item, index) => (item.note === null ? [] : [{ item, index, note: item.note }]));
  const byToday = data.payday_state === "today" || data.payday_state === "late";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id={titleId} className="flex-1 text-xl font-semibold tracking-tight text-ink">
              Safe to spend
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="glass relative grid size-9 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
            >
              <X size={18} />
            </button>
          </header>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-6">
          <p className={cx("text-[28px] leading-tight font-bold tracking-tight break-words tabular-nums", safe < 0 ? "text-expense" : "text-ink")}>
            {headlineText(data)}
          </p>
          <p className="mt-1 text-[14px] text-ink-2">{lineText(data, today)}</p>

          <Card className="mt-5 divide-y divide-line overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">Balance left</span>
              <span className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{decimalMoney(data.balance, currency)}</span>
            </div>
            <p className="px-4 pt-3 pb-2 text-[13px] font-medium text-ink-2">{subheadingText(data, today)}</p>
            {subtracted.map(({ item, index }) => (
              <div key={itemKey(item, index)} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{item.payee}</p>
                  <p className="text-[13px] break-words text-ink-2">{detailText(item, today, currency, false)}</p>
                </div>
                <span className="shrink-0 text-[15px] tabular-nums text-ink">−{decimalMoney(item.subtracted, currency)}</span>
              </div>
            ))}
            {subtracted.length ? null : (
              <p className="px-4 py-3 text-[14px] text-ink-2">
                {byToday ? "Nothing due from your bank by today." : "Nothing due from your bank before payday."}
              </p>
            )}
            <div className="flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{safe < 0 ? "Short" : "Safe to spend"}</span>
              <span className={cx("shrink-0 text-[15px] font-semibold tabular-nums", safe < 0 ? "text-expense" : "text-ink")}>
                {money(Math.abs(safe), currency)}
              </span>
            </div>
          </Card>

          {notSubtracted.length ? (
            <section className="mt-6">
              <h3 className="mb-2 px-1 text-[15px] text-ink-2">Not subtracted</h3>
              <Card className="divide-y divide-line overflow-hidden">
                {notSubtracted.map(({ item, index, note }) => (
                  <div key={itemKey(item, index)} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{item.payee}</p>
                      <p className="text-[13px] break-words text-ink-2">{detailText(item, today, currency, true)}</p>
                    </div>
                    <span className="shrink-0 text-[13px] text-ink-2">{REASON_TEXT[note]}</span>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          <p className="mt-4 px-1 text-[13px] text-ink-2">
            {footnoteText(data, today)} Only payments Folio knows about are subtracted: bank notices and recurring payments. Card
            spends leave your bank with the card bill.
          </p>

          <Card className="mt-5 overflow-hidden">
            <Link href={UPCOMING_PAGE} onClick={onClose} className={ROW}>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">All upcoming payments</span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
