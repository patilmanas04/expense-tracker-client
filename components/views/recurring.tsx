"use client";

import { ChevronLeft, ChevronRight, EyeOff, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { formatMoney, longDayLabel, shortDayLabel, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { Cadence, RecurringDecision, RecurringSeries, RecurringSummary } from "@/lib/types";

import { useData } from "../data-provider";
import { SwipeToDelete } from "../swipe-to-delete";
import { Card, cx, IconTile } from "../ui";

export const RECURRING_PAGE = "/report/recurring";

/** Active items shown on Report's card. */
const CARD_PREVIEW = 3;

const CADENCE_LABEL: Record<Cadence, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/** A decimal string as money, decimals only when there are paise: "₹649", "₹10,688.10". */
const money = (text: string, currency: string) => {
  const minor = toMinor(Number(text));
  return formatMoney(minor, currency, { decimals: minor % 100 !== 0 });
};

/** The monthly total, whole rupees (the server already rounded it): "₹24,067". */
const monthly = (summary: RecurringSummary) =>
  formatMoney(toMinor(Number(summary.monthly_total)), summary.currency, { decimals: false });

/**
 * "10 Nov", with the year when it isn't this year (IST): a yearly renewal reads "10 Nov 2027", not like a
 * day already past. `today` is "YYYY-MM-DD", or "" before the first load (then no year).
 */
const dayLabel = (day: string, today: string) =>
  !today || day.slice(0, 4) === today.slice(0, 4) ? shortDayLabel(day) : `${shortDayLabel(day)} ${day.slice(0, 4)}`;

/** Swipe-row and expanded-row id; the cadence is part of it, as a merchant can recur monthly and yearly. */
const rowId = (s: RecurringSeries) => `recurring:${s.cadence}:${s.merchant_key}`;

/** Report shows the card whenever there is anything to manage, cancelled or hidden series included (D11). */
export const hasRecurringCard = (recurring: RecurringSummary | null) =>
  !!recurring && recurring.items.length + recurring.hidden.length > 0;

/**
 * Report → Recurring: the monthly total and the next three active series, with "See all".
 * It ignores Report's month and Expenses/Income switch: it's about what's coming.
 */
export function RecurringCard() {
  const { recurring, today } = useData();
  if (!recurring || !hasRecurringCard(recurring)) return null;
  const active = recurring.items.filter((s) => s.status === "active");

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <IconTile icon={Repeat} color="#8458F5" size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-ink">Recurring</h2>
        <Link
          href={RECURRING_PAGE}
          className="flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-violet-soft pr-3 pl-4 text-sm font-medium text-violet-strong hover:bg-violet/15"
        >
          See all <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {active.length ? (
        <>
          <p className="mt-4 text-ink">
            <span className="text-[26px] font-semibold tracking-tight tabular-nums">{monthly(recurring)}</span>
            <span className="text-[15px] text-ink-2"> a month</span>
          </p>
          <ul className="mt-3 divide-y divide-line">
            {active.slice(0, CARD_PREVIEW).map((s) => (
              <li key={rowId(s)} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{s.name}</p>
                  {s.late ? (
                    <p className="truncate text-[13px] font-medium text-warn">late?</p>
                  ) : (
                    <p className="truncate text-[13px] text-ink-2">Next {dayLabel(s.next_expected, today)}</p>
                  )}
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{money(s.amount, recurring.currency)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-[15px] text-ink-2">Nothing recurring expected.</p>
      )}
    </Card>
  );
}

/**
 * Report → Recurring → See all. A page of its own: a back button on top, no tab bar. Tap a series
 * for its details and Mark cancelled / Not cancelled / Not recurring; swipe left = Not recurring.
 * Hidden (Not recurring) series can be shown again.
 */
export function RecurringView() {
  const { recurring, recurringFailed, refreshRecurring, decideRecurring, today } = useData();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null); // the one expanded row
  const [busy, setBusy] = useState<string | null>(null); // the row whose action is running
  const [error, setError] = useState<string | null>(null);
  // The list as it was when a decision saved but the reload after it failed; any reload that works replaces it.
  const [unrefreshed, setUnrefreshed] = useState<RecurringSummary | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Back where you came from in the app; opened directly (a link, a reload), back to Report.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/report");
  };

  const retry = () => {
    setRetrying(true);
    void refreshRecurring().finally(() => setRetrying(false));
  };

  /**
   * One decision at a time. From a swipe it rethrows, so the row comes back. Saved but not reloaded, it says
   * so with a Try again (a swiped row stays gone: the decision did save).
   */
  const act = async (s: RecurringSeries, status: RecurringDecision | null, fromSwipe = false) => {
    if (busy !== null) {
      if (fromSwipe) throw new Error("busy");
      return;
    }
    const id = rowId(s);
    setBusy(id);
    setError(null);
    setUnrefreshed(null);
    try {
      const reloaded = await decideRecurring(s.merchant_key, s.cadence, status);
      setOpen((current) => (current === id ? null : current));
      if (!reloaded) setUnrefreshed(recurring);
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't save that. Try again.");
      if (fromSwipe) throw err;
    } finally {
      setBusy(null);
    }
  };

  const active = recurring?.items.filter((s) => s.status === "active") ?? [];
  const cancelled = recurring?.items.filter((s) => s.status === "cancelled") ?? [];

  const row = (s: RecurringSeries, currency: string) => (
    <SeriesRow
      key={rowId(s)}
      series={s}
      currency={currency}
      today={today}
      expanded={open === rowId(s)}
      onToggle={() => setOpen((current) => (current === rowId(s) ? null : rowId(s)))}
      disabled={busy !== null}
      onDecide={(status, fromSwipe) => act(s, status, fromSwipe)}
    />
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-6 lg:px-8 lg:pb-12">
      {/* Only the back button up here, as in iOS Settings. */}
      <div className="sticky top-0 z-20 -mx-4 bg-canvas/85 px-4 pt-safe pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-8 lg:backdrop-blur-none">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="glass relative grid size-10 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Recurring payments</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Payments to the same merchant about every week, month or year. Swipe left on one that isn&apos;t recurring.
      </p>

      {recurring ? (
        <>
          <Card className="mt-5 p-5">
            <p className="text-ink">
              <span className="text-[28px] font-semibold tracking-tight tabular-nums">{monthly(recurring)}</span>
              <span className="text-[15px] text-ink-2"> a month</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">{active.length} active · at current prices</p>
          </Card>

          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}

          {/* Until a reload works (this Try again, or one after new SMS). */}
          {unrefreshed === recurring && recurringFailed ? (
            <div role="alert" className="mt-3 flex items-center gap-3 px-1">
              <p className="min-w-0 flex-1 text-[13px] font-medium text-expense">Saved, but couldn&apos;t refresh the list.</p>
              <button
                type="button"
                onClick={retry}
                disabled={retrying}
                className="h-11 shrink-0 rounded-full bg-violet-soft px-4 text-[14px] font-medium text-violet-strong hover:bg-violet/15 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          ) : null}

          {recurring.items.length + recurring.hidden.length === 0 ? (
            <div className="mt-5 rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] text-ink-2">
                No recurring payments found yet. They appear after 3 regular payments to the same merchant.
              </p>
            </div>
          ) : null}

          {active.length ? (
            <Card className="mt-5 divide-y divide-line overflow-hidden">{active.map((s) => row(s, recurring.currency))}</Card>
          ) : null}

          {cancelled.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Cancelled</h2>
              <Card className="divide-y divide-line overflow-hidden">{cancelled.map((s) => row(s, recurring.currency))}</Card>
            </>
          ) : null}

          {recurring.hidden.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Hidden</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {recurring.hidden.map((s) => (
                  <div key={rowId(s)} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-[13px] text-ink-2">
                        {CADENCE_LABEL[s.cadence]} · {money(s.amount, recurring.currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void act(s, null)}
                      disabled={busy !== null}
                      aria-label={`Show ${s.name} again`}
                      className="h-11 shrink-0 rounded-full px-4 text-[14px] font-medium text-violet-strong hover:bg-violet-soft disabled:opacity-50"
                    >
                      Show again
                    </button>
                  </div>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : recurringFailed ? (
        <Card className="mt-5 p-5 text-center">
          <p className="text-[15px] text-ink">Couldn&apos;t load recurring payments.</p>
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="mt-3 h-11 rounded-full bg-violet-soft px-5 text-[14px] font-medium text-violet-strong hover:bg-violet/15 disabled:opacity-50"
          >
            Try again
          </button>
        </Card>
      ) : (
        <div className="mt-5 space-y-3" aria-label="Loading recurring payments">
          <div className="h-24 animate-pulse rounded-card bg-surface" />
          <div className="h-40 animate-pulse rounded-card bg-surface" />
        </div>
      )}
    </div>
  );
}

/**
 * An active or cancelled series. Tap to expand it in place (details and buttons); swipe left = Not recurring.
 * `onDecide` from a swipe throws on failure, so the row comes back.
 */
function SeriesRow({
  series: s,
  currency,
  today,
  expanded,
  onToggle,
  disabled,
  onDecide,
}: {
  series: RecurringSeries;
  currency: string;
  today: string;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  onDecide: (status: RecurringDecision | null, fromSwipe?: boolean) => Promise<void>;
}) {
  const panelId = useId();
  const isCancelled = s.status === "cancelled";
  const when = isCancelled
    ? "Cancelled"
    : s.late
      ? `expected ${dayLabel(s.next_expected, today)}`
      : `next ${dayLabel(s.next_expected, today)}`;
  const lateChip = !isCancelled && s.late;
  const buttonClass =
    "h-11 rounded-full bg-violet-soft px-4 text-[14px] font-medium text-violet-strong hover:bg-violet/15 disabled:opacity-50";

  return (
    <SwipeToDelete
      id={rowId(s)}
      label="Not recurring"
      icon={EyeOff}
      disabled={disabled}
      contentClassName="bg-surface"
      onDelete={() => onDecide("dismissed", true)}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full min-w-0 items-start gap-3 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{s.name}</span>
          <span className="block truncate text-[13px] text-ink-2">
            {CADENCE_LABEL[s.cadence]} · {when}
          </span>
          {lateChip || s.previous_amount ? (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {lateChip ? (
                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">late?</span>
              ) : null}
              {s.previous_amount ? (
                <span className="max-w-full truncate rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-2">
                  was {money(s.previous_amount, currency)}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className={cx("shrink-0 text-[15px] font-semibold tabular-nums", isCancelled ? "text-ink-2" : "text-ink")}>
          {money(s.amount, currency)}
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="px-4 pb-4">
          <p className="text-[13px] text-ink-2">
            {s.payments} payments since {longDayLabel(s.first_date)} · last paid {dayLabel(s.last_date, today)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isCancelled ? (
              <button type="button" onClick={() => void onDecide(null)} disabled={disabled} className={buttonClass}>
                Not cancelled
              </button>
            ) : (
              <button type="button" onClick={() => void onDecide("cancelled")} disabled={disabled} className={buttonClass}>
                Mark cancelled
              </button>
            )}
            <button type="button" onClick={() => void onDecide("dismissed")} disabled={disabled} className={buttonClass}>
              Not recurring
            </button>
          </div>
        </div>
      ) : null}
    </SwipeToDelete>
  );
}
