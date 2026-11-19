"use client";

import { ChevronLeft, ChevronRight, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { decimalMoney, formatMoney, shiftDay, shortDayLabel, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { UpcomingItem, UpcomingKind, UpcomingList, UpcomingStatus } from "@/lib/types";

import { useData } from "../data-provider";
import { SwipeToDelete } from "../swipe-to-delete";
import { Card, cx } from "../ui";
import { RECURRING_PAGE } from "./recurring";

export const UPCOMING_PAGE = "/upcoming";

/** Rows on Home's card; its total still counts every item in the 7 days. */
const CARD_ROWS = 4;

export const KIND_TEXT: Record<UpcomingKind, string> = { auto_debit: "auto-debit", card_bill: "card bill", expected: "expected" };

/** What's left to pay, in minor units: a card bill less the card payments seen since its notice (never below 0). */
export function stillToPay(item: UpcomingItem): number {
  if (item.kind === "card_bill") return Math.max(toMinor(Number(item.amount)) - toMinor(Number(item.paid_amount)), 0);
  return toMinor(Number(item.amount));
}

/** Home's card: items due today and in the 6 days after it (IST), paid ones left out. [] before the first load. */
export function homeItems(list: UpcomingList, today: string): UpcomingItem[] {
  if (!today) return [];
  const last = shiftDay(today, 6);
  return list.items.filter((i) => i.date >= today && i.date <= last && i.status !== "paid");
}

/** "10 Nov", with the year when it isn't this year (IST), as on Recurring. */
const dayLabel = (day: string, today: string) =>
  !today || day.slice(0, 4) === today.slice(0, 4) ? shortDayLabel(day) : `${shortDayLabel(day)} ${day.slice(0, 4)}`;

/** Expected payments are a guess from history: "around 5 Dec". Notices have a real due date: Today, Tomorrow, "5 Dec". */
export function whenLabel(item: Pick<UpcomingItem, "kind" | "date">, today: string): string {
  if (item.kind === "expected") return `around ${dayLabel(item.date, today)}`;
  if (today) {
    if (item.date === today) return "Today";
    if (item.date === shiftDay(today, 1)) return "Tomorrow";
    if (item.date === shiftDay(today, -1)) return "Yesterday";
  }
  return dayLabel(item.date, today);
}

const title = (item: UpcomingItem) => (item.kind === "card_bill" ? `${item.payee} bill` : item.payee);

/** "₹4,500 (min ₹500)" for a card bill with a minimum, else just the amount. */
const amountText = (item: UpcomingItem, currency: string) =>
  decimalMoney(item.amount, currency) + (item.min_amount ? ` (min ${decimalMoney(item.min_amount, currency)})` : "");

const CHIPS: Partial<Record<UpcomingStatus, { text: string; className: string }>> = {
  paid: { text: "Paid", className: "bg-income-soft text-income" },
  not_seen: { text: "No payment seen", className: "bg-warn-soft text-warn" },
  late: { text: "late?", className: "bg-warn-soft text-warn" },
};

/** Notices by id (so a dismissed row's neighbours keep their state); expected items by name, date and place. */
const rowKey = (item: UpcomingItem, index: number) => item.id ?? `expected:${item.payee}:${item.date}:${index}`;

/** Total for a sum of minor units, decimals only when there are paise. */
const total = (minor: number, currency: string) => formatMoney(minor, currency, { decimals: minor % 100 !== 0 });

/**
 * Home → Upcoming: what's due in the next 7 days (up to four rows) and what's still to pay, with "See all".
 * Hidden while there is nothing due, and until the first load.
 */
export function UpcomingCard() {
  const { upcoming, today } = useData();
  const items = upcoming ? homeItems(upcoming, today) : [];
  if (!upcoming || !items.length) return null;
  const due = items.reduce((sum, i) => sum + stillToPay(i), 0);

  return (
    <section className="mt-8" aria-labelledby="upcoming-heading">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="upcoming-heading" className="text-lg font-semibold tracking-tight text-ink">
          Upcoming
        </h2>
        <Link
          href={UPCOMING_PAGE}
          className="flex h-10 shrink-0 items-center rounded-full bg-violet-soft px-4 text-sm font-medium text-violet-strong hover:bg-violet/15"
        >
          See all
        </Link>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {items.slice(0, CARD_ROWS).map((item, index) => (
          <div key={rowKey(item, index)} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              {/* Wraps (E9): a card bill's number tells one bill from another. */}
              <p className="text-[15px] font-medium break-words text-ink">
                {whenLabel(item, today)} · {title(item)}
              </p>
              <p className="truncate text-[13px] text-ink-2">{KIND_TEXT[item.kind]}</p>
            </div>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
              {amountText(item, upcoming.currency)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-[14px] text-ink-2">Still to pay in 7 days</p>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{total(due, upcoming.currency)}</span>
        </div>
      </Card>
    </section>
  );
}

/**
 * Home → Upcoming → See all. A page of its own: a back button on top, no tab bar. Notices from the bank
 * (auto-debits, card bills) can be swiped away; expected payments open Recurring, where they come from.
 */
export function UpcomingView() {
  const { upcoming, upcomingFailed, refreshUpcoming, dismissUpcoming, today } = useData();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // the notice being dismissed
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Back where you came from in the app; opened directly (a link, a reload, a notification), back to Home.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/");
  };

  const retry = () => {
    setRetrying(true);
    void refreshUpcoming().finally(() => setRetrying(false));
  };

  /** One dismiss at a time; it rethrows on failure, so the swiped row comes back. */
  const dismiss = async (id: string) => {
    if (busy !== null) throw new Error("busy");
    setBusy(id);
    setError(null);
    try {
      await dismissUpcoming(id);
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't dismiss that. Try again.");
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const items = upcoming?.items ?? [];
  const earlier = items.filter((i) => i.date < today);
  const next = items.filter((i) => i.date >= today);
  const open = next.filter((i) => i.status === "upcoming" || i.status === "late");
  const due = open.reduce((sum, i) => sum + stillToPay(i), 0);

  const row = (item: UpcomingItem, index: number, currency: string) => (
    <UpcomingRow
      key={rowKey(item, index)}
      item={item}
      currency={currency}
      today={today}
      disabled={busy !== null}
      onDismiss={dismiss}
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

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Upcoming payments</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        What&apos;s due in the next 30 days: auto-debits and card bills your bank told you about, and regular payments
        expected from your history. Swipe left on a notice to dismiss it.
      </p>

      {upcoming ? (
        <>
          <Card className="mt-5 p-5">
            <p className="text-ink">
              <span className="text-[28px] font-semibold tracking-tight tabular-nums">{total(due, upcoming.currency)}</span>
              <span className="text-[15px] text-ink-2"> still to pay</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">{open.length} due in the next 30 days</p>
          </Card>

          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}

          {items.length === 0 ? (
            <div className="mt-5 rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] text-ink-2">
                Nothing due in the next 30 days. Auto-debits and card bills appear here when your bank sends a notice
                SMS; regular payments appear from your history.
              </p>
            </div>
          ) : null}

          {earlier.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Earlier</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {earlier.map((item, index) => row(item, index, upcoming.currency))}
              </Card>
            </>
          ) : null}

          {next.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Next 30 days</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {next.map((item, index) => row(item, index, upcoming.currency))}
              </Card>
            </>
          ) : null}
        </>
      ) : upcomingFailed ? (
        <Card className="mt-5 p-5 text-center">
          <p className="text-[15px] text-ink">Couldn&apos;t load upcoming payments.</p>
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
        <div className="mt-5 space-y-3" aria-label="Loading upcoming payments">
          <div className="h-24 animate-pulse rounded-card bg-surface" />
          <div className="h-40 animate-pulse rounded-card bg-surface" />
        </div>
      )}
    </div>
  );
}

/**
 * One item. A notice swipes left to dismiss (`onDismiss` throws on failure, so the row comes back); an
 * expected payment links to Recurring.
 */
function UpcomingRow({
  item,
  currency,
  today,
  disabled,
  onDismiss,
}: {
  item: UpcomingItem;
  currency: string;
  today: string;
  disabled: boolean;
  onDismiss: (id: string) => Promise<void>;
}) {
  const chip = CHIPS[item.status];
  const when = whenLabel(item, today);
  const detail = [when, KIND_TEXT[item.kind], item.kind === "auto_debit" ? item.account_ref : null].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold break-words text-ink">{title(item)}</span>
        <span className="block truncate text-[13px] text-ink-2">{detail}</span>
        {chip ? (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={cx("max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium", chip.className)}>
              {chip.text}
            </span>
          </span>
        ) : null}
      </span>
      <span
        className={cx(
          "shrink-0 text-right text-[15px] font-semibold tabular-nums",
          item.status === "paid" ? "text-ink-2" : "text-ink",
        )}
      >
        {amountText(item, currency)}
      </span>
    </>
  );

  if (item.id === null) {
    return (
      <Link
        href={RECURRING_PAGE}
        className="flex w-full min-w-0 items-start gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
      >
        {/* No aria-label: the visible text (name, date, "late?", amount) is the link's name. */}
        {content}
        <span className="sr-only">, see recurring payments</span>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
      </Link>
    );
  }

  const id = item.id;
  return (
    <SwipeToDelete
      id={`upcoming:${id}`}
      label="Dismiss"
      icon={EyeOff}
      disabled={disabled}
      contentClassName="bg-surface"
      onDelete={() => onDismiss(id)}
    >
      <div className="flex w-full min-w-0 items-start gap-3 p-4">
        {content}
        {/* For keyboards and screen readers: hidden until focused (others swipe). The size sits on
            the inner span, as `not-sr-only` resets the button's own. A failure shows in the error line. */}
        <button
          type="button"
          data-swipe-action
          onClick={() => void onDismiss(id).catch(() => {})}
          aria-label={`Dismiss ${title(item)}`}
          title="Dismiss"
          className="sr-only shrink-0 rounded-full text-ink-2 focus-visible:not-sr-only focus-visible:outline-2 focus-visible:outline-violet"
        >
          <span className="grid size-9 place-items-center">
            <EyeOff size={17} aria-hidden />
          </span>
        </button>
      </div>
    </SwipeToDelete>
  );
}
