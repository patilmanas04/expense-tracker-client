"use client";

import { ChevronDown, ChevronLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { Txn } from "@/lib/analytics";
import { ApiError, getBalanceBreakdown } from "@/lib/api";
import { categoryName } from "@/lib/categories";
import { dateTimeLabel, formatMoney, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { Balance, BalanceBreakdown, SkipGroup, SkipReason } from "@/lib/types";

import { useData } from "../data-provider";
import { transactionTitle } from "../transactions";
import { Amount, Card, CategoryTile, cx, IconTile } from "../ui";

export const BALANCE_PAGE = "/settings/balance";

/** Rows rendered at a time, in the counted list and in an open group. */
const PAGE = 50;

/** The server's decimal strings ("-1249.00") in paise. */
const minor = (amount: string) => toMinor(Number(amount));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why a row wasn't counted, in the server's order (balance.SKIP_REASONS): each row has the first that matches. */
const REASONS: { reason: SkipReason; label: (n: number) => string; help: (currency: string) => string }[] = [
  {
    reason: "unreadable",
    label: (n) => `${n} unreadable SMS`,
    help: () => "Folio couldn't read the amount. Open one to fill it in (Needs review).",
  },
  {
    reason: "other_currency",
    label: (n) => `${n} in another currency`,
    help: (currency) => `Balance left counts only ${currency}.`,
  },
  {
    reason: "duplicate",
    label: (n) => plural(n, "possible duplicate", "possible duplicates"),
    help: () => "Held out until you decide. Open one to choose.",
  },
  {
    reason: "cash",
    label: (n) => plural(n, "cash payment", "cash payments"),
    help: () => "Paid in cash, so the bank never saw them.",
  },
  {
    reason: "credit_card",
    label: (n) => plural(n, "credit-card payment", "credit-card payments"),
    help: () => "Card spends leave the bank when you pay the card bill; the bill payment is counted.",
  },
];

/** A fetch's outcome, kept with the balance, transactions, deletes and attempt it was made for. */
type Result = {
  balance: Balance | null;
  txns: Txn[];
  deleting: Txn[];
  attempt: number;
  data: BalanceBreakdown | null;
  error: string | null;
  /** The server has no balance saved (404). */
  missing: boolean;
};

/**
 * Settings → Bank balance → How it's worked out. A page of its own (back button, no tab bar):
 * the saved balance, every transaction since it that moved Balance left, with the balance after
 * each, and the ones left out, grouped by why. Tap a transaction to open its sheet.
 */
export function BalanceBreakdownView() {
  const { balance, txns, deleting, pollNow } = useData();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // The breakdown a check for rows we hadn't loaded yet was made for (see below).
  const [checkedFor, setCheckedFor] = useState<BalanceBreakdown | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Back where you came from in the app; opened directly (a link, a reload), back to Settings.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  // Fetched on arrival, and again when the balance or the transactions change (the 5-second poll
  // replaces them only when something changed), when a delete reaches the server (`deleting`
  // changes; a cash or held-out row doesn't move the balance) or on Try again. The old figures stay meanwhile.
  useEffect(() => {
    if (!balance) return;
    let cancelled = false;
    getBalanceBreakdown().then(
      (data) => {
        if (!cancelled) setResult({ balance, txns, deleting, attempt, data, error: null, missing: false });
      },
      (err: unknown) => {
        if (cancelled) return;
        const missing = err instanceof ApiError && err.status === 404;
        const error = missing ? null : (err instanceof Error && err.message) || "Couldn't load the breakdown.";
        setResult((current) => ({ balance, txns, deleting, attempt, data: current?.data ?? null, error, missing }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [balance, txns, deleting, attempt]);

  const byId = useMemo(() => new Map(txns.map((t) => [t.id, t])), [txns]);
  // Deleted on screen, still on the server until Undo closes: shown as "Deleting…", not tappable.
  // The ones the figures on screen were fetched with stay so until the refetch after the delete lands.
  const fetchedDeleting = result?.deleting;
  const deletingById = useMemo(
    () => new Map([...(fetchedDeleting ?? []), ...deleting].map((t) => [t.id, t])),
    [fetchedDeleting, deleting],
  );
  const data = balance ? (result?.data ?? null) : null;
  // A newer fetch is on its way; the figures on screen stay until it lands (no flicker).
  const stale =
    !result || result.balance !== balance || result.txns !== txns || result.deleting !== deleting || result.attempt !== attempt;

  // The server can name a row the app hasn't polled yet (an SMS that arrived just now, or between
  // the poll's transactions and balance queries). Check for it at once rather than wait for the
  // next poll; until that check is back such rows show as loading, not as "not loaded".
  const unknownRows = useMemo(() => {
    if (!data) return false;
    const ids = [...data.counted.map((row) => row.id), ...REASONS.flatMap(({ reason }) => data.skipped[reason].ids)];
    return ids.some((id) => !byId.has(id) && !deletingById.has(id));
  }, [data, byId, deletingById]);
  useEffect(() => {
    if (!data || !unknownRows) return;
    let cancelled = false;
    let timer = 0;
    const check = () =>
      pollNow().then((ran) => {
        if (cancelled) return;
        if (ran) setCheckedFor(data);
        else timer = window.setTimeout(check, 500); // a fetch is in flight; check after it
      });
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, unknownRows, pollNow]);
  const lookup = useMemo(
    () => ({ byId, deletingById, checking: Boolean(data) && checkedFor !== data }),
    [byId, deletingById, data, checkedFor],
  );
  const error = balance ? (result?.error ?? null) : null;
  const missing = !balance || Boolean(result?.missing);

  // Newest first on screen; the server sends the running-total order.
  const rows = useMemo(() => (data ? [...data.counted].reverse() : []), [data]);

  // Money in and out, in paise.
  const totals = useMemo(() => {
    const sums = { in: 0, out: 0, ins: 0, outs: 0 };
    for (const row of data?.counted ?? []) {
      const effect = minor(row.effect);
      if (effect > 0) {
        sums.in += effect;
        sums.ins += 1;
      } else {
        sums.out += effect;
        sums.outs += 1;
      }
    }
    return sums;
  }, [data]);

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
  }, [rows.length]);

  const retry = () => setAttempt((a) => a + 1);
  const anySkipped = data ? REASONS.some(({ reason }) => data.skipped[reason].count > 0) : false;

  return (
    <div
      aria-busy={Boolean(balance) && stale}
      className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-8 lg:pb-12"
    >
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

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">How it&apos;s worked out</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Balance left is HDFC and ICICI together: the balance you saved, minus money out and plus money in from bank SMS since
        then. Tap any transaction to open it.
      </p>

      {missing ? (
        <div className="mt-5 rounded-card border border-dashed border-line px-4 py-6 text-center">
          <p className="text-[15px] font-medium text-ink">No bank balance saved</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Save the balance in your bank accounts, and this page shows how Balance left follows it.{" "}
            <Link href="/settings#balance" className="font-semibold text-violet-strong focus-visible:outline-2 focus-visible:outline-violet">
              Set it in Settings
            </Link>
          </p>
        </div>
      ) : !data && error ? (
        <Card className="mt-5 p-4">
          <p role="alert" className="text-[15px] text-ink">
            {error}
          </p>
          <TryAgain onClick={retry} className="mt-3" />
        </Card>
      ) : !data ? (
        <div role="status" aria-label="Loading the breakdown" className="mt-5 space-y-3">
          <div className="h-48 animate-pulse rounded-card bg-surface" />
          <div className="h-64 animate-pulse rounded-card bg-surface" />
        </div>
      ) : (
        <>
          {error ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <p role="alert" className="min-w-0 text-[13px] font-medium text-expense">
                {error}
              </p>
              <TryAgain onClick={retry} />
            </div>
          ) : null}

          <Card className="mt-5 divide-y divide-line overflow-hidden">
            <div className="p-4">
              <p className="text-[13px] text-ink-2">Balance left</p>
              <Amount
                minor={minor(data.current)}
                currency={data.currency}
                sign={minor(data.current) < 0 ? "−" : ""}
                className={cx("block truncate text-[32px] font-bold tracking-tight", minor(data.current) < 0 ? "text-expense" : "text-ink")}
                fractionClassName="text-ink-2"
              />
              <p className="text-[12px] text-ink-2">HDFC and ICICI together</p>
            </div>
            <SummaryRow
              label="Starting balance"
              sub={`Read at ${dateTimeLabel(data.start.as_of)}`}
              value={formatMoney(minor(data.start.amount), data.currency)}
            />
            <SummaryRow label={`Money in (${totals.ins})`} value={formatMoney(totals.in, data.currency, { signed: true })} />
            <SummaryRow label={`Money out (${totals.outs})`} value={formatMoney(totals.out, data.currency, { signed: true })} />
            <SummaryRow label="Balance left" value={formatMoney(minor(data.current), data.currency)} strong />
          </Card>

          <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Not counted</h2>
          {anySkipped ? (
            <Card className="divide-y divide-line overflow-hidden">
              {REASONS.filter(({ reason }) => data.skipped[reason].count > 0).map(({ reason, label, help }) => (
                <SkipGroupRow
                  key={reason}
                  label={label(data.skipped[reason].count)}
                  help={help(data.currency)}
                  group={data.skipped[reason]}
                  currency={data.currency}
                  lookup={lookup}
                />
              ))}
            </Card>
          ) : (
            <p className="px-1 text-[13px] text-ink-2">Nothing was left out.</p>
          )}

          <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Counted ({data.counted.length})</h2>
          {rows.length ? (
            <>
              <Card className="divide-y divide-line overflow-hidden">
                {rows.slice(0, visible).map((row) => (
                  <BreakdownRow
                    key={row.id}
                    id={row.id}
                    lookup={lookup}
                    effect={row.effect}
                    running={row.running}
                    currency={data.currency}
                  />
                ))}
              </Card>
              {visible < rows.length ? <div ref={sentinelRef} className="h-10" aria-hidden /> : null}
            </>
          ) : (
            <p className="px-1 text-[13px] text-ink-2">No bank transactions since you saved your balance.</p>
          )}
        </>
      )}
    </div>
  );
}

function TryAgain({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-9 shrink-0 rounded-full bg-violet-soft px-3.5 text-sm font-semibold text-violet-strong focus-visible:outline-2 focus-visible:outline-violet",
        className,
      )}
    >
      Try again
    </button>
  );
}

function SummaryRow({ label, sub, value, strong = false }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
      <span className="min-w-0">
        <span className={cx("block text-[15px] text-ink", strong && "font-semibold")}>{label}</span>
        {sub ? <span className="block text-[13px] text-ink-2">{sub}</span> : null}
      </span>
      <span className={cx("shrink-0 text-[15px] whitespace-nowrap tabular-nums", strong ? "font-semibold text-ink" : "text-ink-2")}>
        {value}
      </span>
    </div>
  );
}

/** One reason's left-out transactions: tap to show them (newest first, 50 at a time). */
function SkipGroupRow({
  label,
  help,
  group,
  currency,
  lookup,
}: {
  label: string;
  help: string;
  group: SkipGroup;
  currency: string;
  lookup: Lookup;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const listId = useId();
  const ids = useMemo(() => [...group.ids].reverse(), [group.ids]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-ink">{label}</span>
          <span className="block text-[13px] leading-snug text-ink-2">{help}</span>
        </span>
        {group.total !== null ? (
          <span className="shrink-0 text-[15px] whitespace-nowrap text-ink-2 tabular-nums">
            {formatMoney(minor(group.total), currency, { signed: true })}
          </span>
        ) : null}
        <ChevronDown size={18} className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={listId} hidden={!open} className="divide-y divide-line border-t border-line bg-canvas/40">
        {open ? (
          <>
            {ids.slice(0, shown).map((id) => (
              <BreakdownRow key={id} id={id} lookup={lookup} currency={currency} />
            ))}
            {shown < ids.length ? (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setShown((s) => s + PAGE)}
                  className="h-9 rounded-full bg-violet-soft px-3.5 text-sm font-semibold text-violet-strong focus-visible:outline-2 focus-visible:outline-violet"
                >
                  Show {PAGE} more
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Where a breakdown row finds its transaction. */
type Lookup = {
  byId: Map<string, Txn>;
  /** Deleted on screen; the server still has them until the delete goes through. */
  deletingById: Map<string, Txn>;
  /** A check for rows the app hasn't loaded yet is on its way. */
  checking: boolean;
};

/**
 * A transaction in the breakdown: tap to open its sheet. Counted rows show their effect and the
 * balance after them; left-out rows show their own amount, greyed.
 */
function BreakdownRow({
  id,
  lookup,
  effect,
  running,
  currency,
}: {
  id: string;
  lookup: Lookup;
  effect?: string;
  running?: string;
  currency: string;
}) {
  const { openTransaction } = useData();
  const deleted = lookup.byId.has(id) ? undefined : lookup.deletingById.get(id);
  const txn = lookup.byId.get(id) ?? deleted;

  const effectText = (amount: string) => {
    const value = minor(amount);
    return (
      <span
        className={cx(
          "block text-[15px] font-semibold whitespace-nowrap tabular-nums",
          value < 0 ? "text-expense" : value > 0 ? "text-income" : "text-ink-2",
        )}
      >
        {formatMoney(value, currency, { signed: true })}
      </span>
    );
  };

  if (!txn) {
    // Not loaded yet: just arrived, and being fetched now. Still missing after that check (rare: a reload fixes it).
    return (
      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        {lookup.checking ? (
          <span role="status" className="min-w-0 flex-1 truncate text-[15px] text-ink-3">
            Loading…
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink-3">Transaction not loaded</span>
        )}
        {effect !== undefined ? <span className="shrink-0 text-right">{effectText(effect)}</span> : null}
      </div>
    );
  }

  const debit = txn.type === "DEBIT";
  let amount: ReactNode;
  if (effect !== undefined) amount = effectText(effect);
  else
    amount = (
      <span className="block text-[15px] font-semibold whitespace-nowrap text-ink-3 tabular-nums">
        {txn.is_parsed ? formatMoney(debit ? -txn.minor : txn.minor, txn.currency, { signed: true }) : "—"}
      </span>
    );

  const content = (
    <>
      {txn.is_parsed ? <CategoryTile name={categoryName(txn)} size="sm" /> : <IconTile icon={TriangleAlert} color="#EDA100" size="sm" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{transactionTitle(txn)}</span>
        <span className="block truncate text-[13px] text-ink-2">
          {deleted ? "Deleting…" : dateTimeLabel(txn.transaction_time)}
          {!deleted && txn.account_ref ? ` · ${txn.account_ref}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {amount}
        {running !== undefined ? (
          <span className="mt-0.5 block text-[12px] whitespace-nowrap text-ink-2 tabular-nums">
            Balance {formatMoney(minor(running), currency)}
          </span>
        ) : null}
      </span>
    </>
  );

  // Deleted, waiting out Undo: it still counts until the delete reaches the server, then the breakdown refetches.
  if (deleted) return <div className="flex w-full items-center gap-3 px-4 py-3 opacity-60">{content}</div>;

  return (
    <button
      type="button"
      onClick={() => openTransaction(id)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
    >
      {content}
    </button>
  );
}
