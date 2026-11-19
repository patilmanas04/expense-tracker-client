"use client";

import { ChevronDown, ChevronRight, HandCoins, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { addCashEntry, getLedger } from "@/lib/api";
import { parseAmountInput, shortDayLabel, toMinor } from "@/lib/format";
import {
  LEDGER_ERRORS,
  NOTE_MAX,
  amountInput,
  balanceText,
  kindLabel,
  ledgerMoney,
  personError,
  settleEntry,
} from "@/lib/ledger";
import { cameFromApp } from "@/lib/nav-history";
import type { Ledger, LedgerEntry, LedgerPerson } from "@/lib/types";

import { BackBar, BottomSheet, FAB, SHEET_BUTTON, SHEET_FIELD, SheetLabel } from "../bottom-sheet";
import { useData } from "../data-provider";
import { Card, IconTile, Segmented, cx } from "../ui";

export const LEDGER_PAGE = "/settings/lend-borrow";

const minorOf = (amount: number) => toMinor(amount);

/** The person's amount, coloured: income when they owe you, expense when you owe them. */
function BalanceAmount({ minor, className }: { minor: number; className?: string }) {
  return (
    <span className={cx("shrink-0 font-semibold tabular-nums", minor > 0 ? "text-income" : minor < 0 ? "text-expense" : "text-ink-2", className)}>
      {ledgerMoney(Math.abs(minor))}
    </span>
  );
}

/**
 * Settings → Lend & borrow: everyone you've split with, lent to or borrowed from. Open balances first, settled
 * people behind "Show settled". A person opens their history and Settle up; + records a cash entry.
 */
export function LedgerView() {
  const { txns, deleting } = useData();
  const router = useRouter();
  const [state, setState] = useState<{ ledger: Ledger | null; failed: boolean }>({ ledger: null, failed: false });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const closePerson = useCallback(() => setOpenKey(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  const reload = useCallback(
    () =>
      getLedger().then(
        (ledger) => setState({ ledger, failed: false }),
        () => setState((current) => ({ ledger: current.ledger, failed: true })),
      ),
    [],
  );

  // On arrival, and whenever transactions change (a split saved or a payment deleted in its sheet).
  useEffect(() => {
    let cancelled = false;
    getLedger().then(
      (ledger) => {
        if (!cancelled) setState({ ledger, failed: false });
      },
      () => {
        if (!cancelled) setState((current) => ({ ledger: current.ledger, failed: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [txns, deleting]);

  const ledger = state.ledger;
  const open = ledger?.people.filter((p) => p.balance !== 0) ?? [];
  const settled = ledger?.people.filter((p) => p.balance === 0) ?? [];
  const owedToYou = open.reduce((sum, p) => sum + Math.max(0, minorOf(p.balance)), 0);
  const youOwe = open.reduce((sum, p) => sum + Math.max(0, -minorOf(p.balance)), 0);
  const person = openKey ? (ledger?.people.find((p) => p.key === openKey) ?? null) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-8 lg:pb-12">
      <BackBar onBack={back} />

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Lend &amp; borrow</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Splits and loans with people. Lent money isn&apos;t counted as spending; repayments aren&apos;t income. Split a
        payment from its details in Activity.
      </p>

      {ledger ? (
        <>
          <p className="mt-5 px-1 text-[15px] text-ink-2">
            Owed to you <span className="font-semibold text-income tabular-nums">{ledgerMoney(owedToYou)}</span> · You owe{" "}
            <span className="font-semibold text-expense tabular-nums">{ledgerMoney(youOwe)}</span>
          </p>

          <h2 className="mt-5 mb-2 px-1 text-[15px] text-ink-2">Open</h2>
          {open.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {open.map((p) => (
                <PersonRow key={p.key} p={p} onOpen={() => setOpenKey(p.key)} />
              ))}
            </Card>
          ) : (
            <div className="rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] font-medium text-ink">No one owes you, and you owe no one.</p>
              <p className="mt-1 text-[13px] text-ink-2">Tap + to record cash you lent or borrowed.</p>
            </div>
          )}

          {settled.length ? (
            <>
              <button
                type="button"
                onClick={() => setShowSettled((v) => !v)}
                aria-expanded={showSettled}
                className="mt-5 flex h-10 items-center gap-1 rounded-full px-1 text-[15px] font-medium text-violet-strong focus-visible:outline-2 focus-visible:outline-violet"
              >
                {showSettled ? "Hide settled" : `Show settled (${settled.length})`}
                <ChevronDown size={16} className={cx("transition", showSettled && "rotate-180")} aria-hidden />
              </button>
              {showSettled ? (
                <Card className="mt-2 divide-y divide-line overflow-hidden">
                  {settled.map((p) => (
                    <PersonRow key={p.key} p={p} onOpen={() => setOpenKey(p.key)} />
                  ))}
                </Card>
              ) : null}
            </>
          ) : null}
          {state.failed ? <p className="mt-3 px-1 text-[13px] text-ink-2">Couldn&apos;t refresh. Showing what was loaded.</p> : null}
        </>
      ) : state.failed ? (
        <Card className="mt-5 p-5 text-center">
          <p className="text-[15px] text-ink">Couldn&apos;t load lend &amp; borrow.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 h-10 rounded-full bg-violet-soft px-4 text-sm font-medium text-violet-strong hover:bg-violet/15"
          >
            Try again
          </button>
        </Card>
      ) : (
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface" aria-label="Loading lend and borrow" />
      )}

      <button type="button" onClick={() => setAdding(true)} aria-label="Add cash entry" title="Add cash entry" className={FAB}>
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {person ? <PersonSheet key={person.key} p={person} onClose={closePerson} onChanged={reload} /> : null}
      {adding ? <CashSheet ledger={ledger} onClose={closeAdd} onSaved={reload} /> : null}
    </div>
  );
}

function PersonRow({ p, onOpen }: { p: LedgerPerson; onOpen: () => void }) {
  const minor = minorOf(p.balance);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
    >
      <IconTile icon={HandCoins} color={minor > 0 ? "#22B566" : minor < 0 ? "#E34948" : "#A1A1AA"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{p.person}</span>
        <span className="block truncate text-[13px] text-ink-2">{balanceText(p.person, minor)}</span>
      </span>
      {minor !== 0 ? <BalanceAmount minor={minor} className="text-[15px]" /> : null}
      <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
    </button>
  );
}

/** One person: balance, Settle up, and every entry (a linked one opens its payment). */
function PersonSheet({ p, onClose, onChanged }: { p: LedgerPerson; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const { today, openTransaction, deleteLedgerEntry, txns } = useData();
  const [busy, setBusy] = useState<string | null>(null); // "settle" or an entry id
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minor = minorOf(p.balance);
  const settle = settleEntry(minor);

  const settleUp = async () => {
    if (!settle || !today) return;
    setBusy("settle");
    setError(null);
    try {
      await addCashEntry({ person: p.person, kind: settle.kind, amount: amountInput(settle.amountMinor), day: today });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't settle up.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: LedgerEntry) => {
    if (confirming !== entry.id) {
      setConfirming(entry.id);
      return;
    }
    setBusy(entry.id);
    setError(null);
    try {
      await deleteLedgerEntry(entry.id);
      setConfirming(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that.");
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const openPayment = (id: string) => {
    onClose();
    openTransaction(id);
  };

  return (
    <BottomSheet id="person" title={p.person} onClose={onClose}>
      <p className={cx("text-[17px] font-semibold", minor > 0 ? "text-income" : minor < 0 ? "text-expense" : "text-ink-2")}>
        {balanceText(p.person, minor)}
      </p>
      {settle ? (
        <>
          <button type="button" onClick={() => void settleUp()} disabled={busy !== null} className={cx(SHEET_BUTTON, "mt-4")}>
            {busy === "settle" ? "Saving…" : `Settle up · ${ledgerMoney(settle.amountMinor)}`}
          </button>
          <p className="mt-2 text-[13px] text-ink-2">
            {minor > 0
              ? `Records ${ledgerMoney(settle.amountMinor)} paid back by ${p.person} in cash, today.`
              : `Records ${ledgerMoney(settle.amountMinor)} you paid back to ${p.person} in cash, today.`}
          </p>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}

      <h3 className="mt-5 mb-2 text-[15px] text-ink-2">History</h3>
      <Card className="divide-y divide-line overflow-hidden">
        {p.entries.map((e) => {
          const label = kindLabel(e.kind, p.person);
          const linked = e.transaction_id !== null && txns.some((t) => t.id === e.transaction_id);
          const where = e.transaction_id ? (e.merchant ?? "a payment") : "Cash";
          const detail = [shortDayLabel(e.day), where, e.note].filter(Boolean).join(" · ");
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">{label}</span>
                <span className="block truncate text-[13px] text-ink-2">{detail}</span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{ledgerMoney(toMinor(e.amount))}</span>
            </>
          );
          return (
            <div key={e.id} className="px-4 py-2.5">
              {linked ? (
                <button
                  type="button"
                  onClick={() => openPayment(e.transaction_id!)}
                  aria-label={`${label}, ${ledgerMoney(toMinor(e.amount))}, ${detail}. Open the payment`}
                  className="flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-violet"
                >
                  {body}
                  <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-3">{body}</div>
              )}
              <div className="mt-1 flex min-w-0 items-center justify-end gap-2">
                {confirming === e.id && e.transaction_id ? (
                  <span className="min-w-0 truncate text-[12px] text-ink-2">Removes it from {e.merchant ?? "the payment"} too</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(e)}
                  onBlur={() => setConfirming((current) => (current === e.id && busy !== e.id ? null : current))}
                  disabled={busy !== null}
                  aria-label={`${busy === e.id ? "Removing" : confirming === e.id ? "Tap again to remove" : "Remove"} ${label}, ${ledgerMoney(toMinor(e.amount))}`}
                  className={cx(
                    "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium transition disabled:opacity-50",
                    confirming === e.id ? "bg-expense text-white" : "text-expense hover:bg-expense-soft",
                  )}
                >
                  {busy === e.id ? "Removing…" : confirming === e.id ? "Tap again to remove" : "Remove"}
                </button>
              </div>
            </div>
          );
        })}
      </Card>
    </BottomSheet>
  );
}

/** + : cash lent or borrowed, without a payment. */
function CashSheet({ ledger, onClose, onSaved }: { ledger: Ledger | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { today } = useData();
  const personRef = useRef<HTMLInputElement>(null);
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState<"lent" | "borrowed">("lent");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same checks and texts as the server.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = person.trim().replace(/\s+/g, " ");
    const problem = personError(name);
    if (problem) return setError(problem);
    const value = parseAmountInput(amount);
    if (value === null || toMinor(Number(value)) <= 0) return setError(LEDGER_ERRORS.amount);
    if (!day) return setError("Pick a date.");
    if (day > today) return setError(LEDGER_ERRORS.future);
    if ([...note.trim()].length > NOTE_MAX) return setError(LEDGER_ERRORS.note);
    setSaving(true);
    setError(null);
    try {
      await addCashEntry({ person: name, kind, amount: value, day, note: note.trim() || null });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setSaving(false);
    }
  };

  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setError(null);
  };

  return (
    <BottomSheet
      id="cash"
      title="Add cash entry"
      onClose={onClose}
      initialFocus={personRef}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <button type="submit" form="cash-form" disabled={saving} className={SHEET_BUTTON}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="cash-form" onSubmit={submit} noValidate className="space-y-4">
        <Segmented
          label="Kind"
          value={kind}
          onChange={change(setKind)}
          options={[
            { value: "lent", label: "Lent to" },
            { value: "borrowed", label: "Borrowed from" },
          ]}
        />
        <div>
          <SheetLabel htmlFor="cash-person">{kind === "lent" ? "Lent to" : "Borrowed from"}</SheetLabel>
          <input
            ref={personRef}
            id="cash-person"
            list="ledger-people-cash"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={80}
            placeholder="Name"
            value={person}
            onChange={(e) => change(setPerson)(e.target.value)}
            className={SHEET_FIELD}
          />
          <datalist id="ledger-people-cash">
            {(ledger?.people ?? []).map((p) => (
              <option key={p.key} value={p.person} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <SheetLabel htmlFor="cash-amount">Amount</SheetLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
                ₹
              </span>
              <input
                id="cash-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => change(setAmount)(e.target.value)}
                className={cx(SHEET_FIELD, "pl-8 font-semibold tabular-nums")}
              />
            </div>
          </div>
          <div className="min-w-0">
            <SheetLabel htmlFor="cash-day">Date</SheetLabel>
            <input
              id="cash-day"
              type="date"
              max={today}
              value={day}
              onChange={(e) => change(setDay)(e.target.value)}
              className={cx(SHEET_FIELD, "appearance-none px-3 [&::-webkit-date-and-time-value]:text-left")}
            />
          </div>
        </div>
        <div>
          <SheetLabel htmlFor="cash-note">Note (optional)</SheetLabel>
          <input
            id="cash-note"
            autoComplete="off"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => change(setNote)(e.target.value)}
            className={SHEET_FIELD}
          />
        </div>
        <p className="text-[13px] text-ink-2">Cash entries change who owes whom, never Spent, Income or Balance left.</p>
      </form>
    </BottomSheet>
  );
}
