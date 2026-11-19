"use client";

import { HandCoins, Plus, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isHeldOut, type Txn } from "@/lib/analytics";
import { getLedger, getLinkedEntries } from "@/lib/api";
import { parseAmountInput, toMinor } from "@/lib/format";
import {
  LEDGER_ERRORS,
  MAX_ENTRIES,
  amountInput,
  equalShares,
  kindLabel,
  ledgerMoney,
  owedBy,
  personError,
} from "@/lib/ledger";
import type { Ledger, LedgerEntry, LedgerEntryInput, LedgerKind } from "@/lib/types";

import { useData } from "./data-provider";
import { cx } from "./ui";

/** What opened the editor: one of the actions, or Edit (the entries already there). */
type Action = "split" | LedgerKind | "edit";

/**
 * One editor row, as typed. `auto` rows follow the payment until an amount is typed by hand: "split" takes an
 * equal share, "left" what the other rows leave, "owed" the smaller of that and what the person owes you.
 */
interface Row {
  key: number;
  person: string;
  kind: LedgerKind;
  amount: string;
  auto: "split" | "left" | "owed" | null;
  note: string | null;
}

const ACTIONS: Record<"DEBIT" | "CREDIT", { action: Action; label: string }[]> = {
  DEBIT: [
    { action: "split", label: "Split with people" },
    { action: "lent", label: "Lent to …" },
    { action: "repaid_by_me", label: "Repaid to …" },
  ],
  CREDIT: [
    { action: "repaid_to_me", label: "Repayment from …" },
    { action: "borrowed", label: "Borrowed from …" },
  ],
};

/** The words before a row's name field. */
const KIND_WORDS: Record<LedgerKind, string> = {
  lent: "Lent to",
  repaid_by_me: "Repaid to",
  borrowed: "Borrowed from",
  repaid_to_me: "Repayment from",
};

const CAPSULE =
  "h-9 rounded-full px-4 text-[15px] font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60";
const DASHED =
  "flex h-10 max-w-full items-center gap-1.5 rounded-full border border-dashed border-line bg-surface/60 px-3.5 text-sm font-medium text-violet transition hover:border-violet/40 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50";
const INPUT =
  "h-11 w-full min-w-0 rounded-2xl border border-line bg-canvas px-3 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15 disabled:opacity-60";

/** Paise in a typed amount; 0 when it isn't one yet. */
const minorOf = (text: string) => {
  const amount = parseAmountInput(text);
  return amount === null ? 0 : toMinor(Number(amount));
};

const toRow = (e: LedgerEntry, key: number): Row => ({
  key,
  person: e.person,
  kind: e.kind,
  amount: amountInput(toMinor(e.amount)),
  auto: null,
  note: e.note,
});

const toInput = (e: LedgerEntry): LedgerEntryInput => ({
  person: e.person,
  kind: e.kind,
  amount: amountInput(toMinor(e.amount)),
  note: e.note,
});

/**
 * The transaction sheet's Lend & borrow section (parsed INR rows): the entries linked to this payment, each
 * removable, and the actions that add them. Debit: Split with people, Lent to, Repaid to; credit: Repayment
 * from, Borrowed from. They open an inline editor; Save replaces the payment's entries on the server.
 */
export function LendBorrowCard({ t }: { t: Txn }) {
  const { saveLinkedEntries } = useData();
  const debit = t.type === "DEBIT";
  const held = isHeldOut(t);
  const firstRef = useRef<HTMLInputElement>(null); // the editor's first new (or first) name field
  const buttons = useRef<Partial<Record<Action, HTMLButtonElement | null>>>({});
  const opener = useRef<Action>("edit"); // the button focus goes back to
  const refocus = useRef(false);
  const nextKey = useRef(0);
  // The entries last fetched (or saved), kept on screen while the row's next change refetches them.
  const [loaded, setLoaded] = useState<{ entries: LedgerEntry[]; failed: boolean } | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null); // suggestions and what people owe; loaded on first use
  const ledgerRequested = useRef(false);
  const [form, setForm] = useState<{ action: Action; rows: Row[]; focusKey: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = form !== null;

  useEffect(() => {
    if (t.linked_amount <= 0) return;
    let cancelled = false;
    getLinkedEntries(t.id).then(
      (entries) => {
        if (!cancelled) setLoaded({ entries, failed: false });
      },
      () => {
        if (!cancelled) setLoaded((current) => ({ entries: current?.entries ?? [], failed: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [t.id, t.updated_at, t.linked_amount]);

  // Opening the editor (or Add person) focuses the new name field.
  const focusKey = form?.focusKey ?? null;
  useEffect(() => {
    if (!editing) return;
    firstRef.current?.focus({ preventScroll: true });
    firstRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [editing, focusKey]);

  // Save, Cancel or a removed entry lands on the button that opened the editor (or the first action), once the
  // buttons are enabled again.
  useEffect(() => {
    if (editing || saving || !refocus.current) return;
    refocus.current = false;
    (buttons.current[opener.current] ?? buttons.current.edit ?? buttons.current[debit ? "split" : "repaid_to_me"])?.focus();
  }, [editing, saving, debit]);

  // None linked: nothing to fetch. Otherwise null until the first fetch answers.
  const entries: LedgerEntry[] | null = t.linked_amount > 0 ? (loaded?.entries ?? null) : [];
  const ready = entries !== null && !(t.linked_amount > 0 && loaded?.failed && !loaded.entries.length);
  if (held && !entries?.length) return null; // a possible duplicate is decided first

  const loadLedger = () => {
    if (ledgerRequested.current) return;
    ledgerRequested.current = true;
    getLedger().then(setLedger, () => {
      ledgerRequested.current = false; // no suggestions this time; the next action tries again
    });
  };

  const retry = () => {
    getLinkedEntries(t.id).then(
      (list) => setLoaded({ entries: list, failed: false }),
      () => setLoaded((current) => ({ entries: current?.entries ?? [], failed: true })),
    );
  };

  const newRow = (kind: LedgerKind, auto: Row["auto"]): Row => ({ key: nextKey.current++, person: "", kind, amount: "", auto, note: null });

  const open = (action: Action) => {
    if (!entries) return;
    opener.current = action;
    loadLedger();
    const rows = entries.map((e) => toRow(e, nextKey.current++));
    const added =
      action === "edit"
        ? []
        : action === "split"
          ? [newRow("lent", "split"), newRow("lent", "split")]
          : [newRow(action, action === "repaid_to_me" ? "owed" : "left")];
    setForm({ action, rows: [...rows, ...added], focusKey: (added[0] ?? rows[0])?.key ?? null });
    setError(null);
  };

  const stop = () => {
    refocus.current = true;
    setForm(null);
    setError(null);
  };

  /** Each row's amount as shown: typed, or worked out while it still follows the payment. */
  const amounts = (rows: Row[]): number[] => {
    const typed = rows.reduce((sum, r) => sum + (r.auto === null ? minorOf(r.amount) : 0), 0);
    const left = Math.max(0, t.minor - typed);
    const splits = rows.filter((r) => r.auto === "split").length;
    const share = splits ? equalShares(left, splits).shares[0] : 0;
    return rows.map((r) => {
      if (r.auto === null) return minorOf(r.amount);
      if (r.auto === "split") return share;
      if (r.auto === "owed") {
        const owed = owedBy(ledger, r.person);
        return owed > 0 ? Math.min(left, owed) : left;
      }
      return left;
    });
  };

  const shown = form ? amounts(form.rows) : [];
  const mine = t.minor - shown.reduce((sum, m) => sum + m, 0);

  const setPerson = (key: number, person: string) => {
    setForm((current) => current && { ...current, rows: current.rows.map((r) => (r.key === key ? { ...r, person } : r)) });
    setError(null);
  };

  // Typing an amount stops every row following the payment: the others keep what they show now (D22).
  const setAmount = (key: number, amount: string) => {
    setForm((current) => {
      if (!current) return current;
      const now = amounts(current.rows);
      return {
        ...current,
        rows: current.rows.map((r, i) => ({
          ...r,
          amount: r.key === key ? amount : r.auto === null ? r.amount : amountInput(now[i]),
          auto: null,
        })),
      };
    });
    setError(null);
  };

  const addPerson = () => {
    setForm((current) => {
      if (!current || current.rows.length >= MAX_ENTRIES) return current;
      const following = current.rows.some((r) => r.auto === "split");
      const kind: LedgerKind = current.action === "split" || current.action === "edit" ? (debit ? "lent" : "repaid_to_me") : current.action;
      const row = newRow(kind, current.action === "split" && following ? "split" : null);
      return { ...current, rows: [...current.rows, row], focusKey: row.key };
    });
    setError(null);
  };

  const removeRow = (key: number) => {
    setForm((current) => current && { ...current, rows: current.rows.filter((r) => r.key !== key) });
    setError(null);
  };

  /** Sends the whole list; the server replaces what the payment had. */
  const send = async (list: LedgerEntryInput[]) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveLinkedEntries(t.id, list);
      setLoaded({ entries: saved.entries, failed: false }); // shown while the updated row refetches them
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Same checks and texts as the server.
  const save = async () => {
    if (!form) return;
    if (form.rows.length > MAX_ENTRIES) return setError(LEDGER_ERRORS.entries);
    const list: LedgerEntryInput[] = [];
    for (const [i, r] of form.rows.entries()) {
      const person = r.person.trim().replace(/\s+/g, " ");
      const problem = personError(person);
      if (problem) return setError(problem);
      if (shown[i] <= 0) return setError(LEDGER_ERRORS.amount);
      list.push({ person, kind: r.kind, amount: amountInput(shown[i]), note: r.note });
    }
    if (mine < 0) return setError(LEDGER_ERRORS.over);
    refocus.current = true;
    if (await send(list)) setForm(null);
    else refocus.current = false;
  };

  const remove = (entry: LedgerEntry) => {
    if (!entries) return;
    // The row goes away: land on Edit (or the first action) instead of <body>.
    opener.current = "edit";
    refocus.current = true;
    void send(entries.filter((o) => o.id !== entry.id).map(toInput)).then((ok) => {
      if (!ok) refocus.current = false;
    });
  };

  const errorLine = error ? (
    <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
      {error}
    </p>
  ) : null;

  const heading = (
    <p id={`lb-title-${t.id}`} className="flex items-center gap-2 text-sm font-medium text-ink-2">
      <HandCoins size={16} aria-hidden /> Lend &amp; borrow
    </p>
  );

  if (form) {
    const names = ledger?.people.map((p) => p.person) ?? [];
    return (
      <form
        aria-labelledby={`lb-title-${t.id}`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) {
            e.preventDefault(); // keeps the sheet open
            stop();
          }
        }}
        className="mb-4 min-w-0 rounded-card border border-line/70 bg-surface p-4 shadow-card"
      >
        {heading}
        <datalist id="ledger-people">
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {form.rows.length ? (
          <ul className="mt-3 space-y-3">
            {form.rows.map((r, i) => (
              <li key={r.key} className="min-w-0">
                <label htmlFor={`lb-person-${r.key}`} className="mb-1 block text-[13px] font-medium text-ink-2">
                  {KIND_WORDS[r.kind]}
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_7rem_2.25rem] items-center gap-2">
                  <input
                    ref={r.key === form.focusKey ? firstRef : undefined}
                    id={`lb-person-${r.key}`}
                    list="ledger-people"
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    maxLength={80}
                    placeholder="Name"
                    value={r.person}
                    disabled={saving}
                    onChange={(e) => setPerson(r.key, e.target.value)}
                    className={INPUT}
                  />
                  <div className="relative min-w-0">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
                      ₹
                    </span>
                    <input
                      aria-label={`Amount for ${r.person.trim() || `person ${i + 1}`}`}
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="done"
                      value={r.auto === null ? r.amount : amountInput(shown[i])}
                      disabled={saving}
                      onChange={(e) => setAmount(r.key, e.target.value)}
                      className={cx(INPUT, "pl-7 font-semibold tabular-nums")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    disabled={saving}
                    aria-label={`Remove ${r.person.trim() || `person ${i + 1}`}`}
                    className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-track hover:text-ink focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50"
                  >
                    <X size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-ink-2">No entries. Save to remove them all from this payment.</p>
        )}
        {form.rows.length < MAX_ENTRIES ? (
          <button type="button" onClick={addPerson} disabled={saving} className={cx(DASHED, "mt-3")}>
            <Plus size={16} aria-hidden /> Add person
          </button>
        ) : null}
        <p aria-live="polite" className={cx("mt-3 text-[14px]", mine < 0 ? "font-medium text-expense" : "text-ink-2")}>
          {debit ? "Your share" : "Counts as income"}{" "}
          <span className={cx("font-semibold tabular-nums", mine < 0 ? "text-expense" : "text-ink")}>
            {mine < 0 ? `−${ledgerMoney(-mine)}` : ledgerMoney(mine)}
          </span>
          {mine < 0 ? <span className="block">{LEDGER_ERRORS.over}</span> : null}
        </p>
        {errorLine}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={stop} disabled={saving} className={cx(CAPSULE, "glass relative text-ink")}>
            Cancel
          </button>
          <button type="submit" disabled={saving || mine < 0} className={cx(CAPSULE, "glass-tint relative")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    );
  }

  const list = entries ?? [];
  return (
    <section aria-labelledby={`lb-title-${t.id}`} className="mb-4 min-w-0 rounded-card border border-line/70 bg-surface p-4 shadow-card">
      {heading}
      {entries === null ? (
        <p className="mt-2 text-[14px] text-ink-2">Loading…</p>
      ) : list.length ? (
        <>
          <ul className="mt-2 divide-y divide-line">
            {list.map((e) => {
              const label = kindLabel(e.kind, e.person);
              return (
                <li key={e.id} className="flex min-w-0 items-center gap-2 py-1.5">
                  <Users size={15} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="flex min-w-0 flex-1 text-[15px] text-ink">
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="shrink-0 font-semibold whitespace-pre tabular-nums"> · {ledgerMoney(toMinor(e.amount))}</span>
                  </span>
                  {held ? null : (
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      disabled={saving}
                      aria-label={`Remove ${label}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-track hover:text-ink focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50"
                    >
                      <X size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[14px] text-ink-2">
            {debit ? "Your share" : "Counts as income"}{" "}
            <span className="font-semibold text-ink tabular-nums">{ledgerMoney(t.counted)}</span>
          </p>
        </>
      ) : null}
      {loaded?.failed ? (
        <p className="mt-2 text-[13px] text-ink-2">
          Couldn&apos;t load the entries.{" "}
          <button type="button" onClick={retry} className="font-medium text-violet-strong">
            Try again
          </button>
        </p>
      ) : null}
      {held ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {ACTIONS[t.type].map(({ action, label }) => (
            <button
              key={action}
              ref={(el) => {
                buttons.current[action] = el;
              }}
              type="button"
              onClick={() => open(action)}
              disabled={!ready || saving}
              className={DASHED}
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
          {list.length ? (
            <button
              ref={(el) => {
                buttons.current.edit = el;
              }}
              type="button"
              onClick={() => open("edit")}
              disabled={!ready || saving}
              className={DASHED}
            >
              Edit
            </button>
          ) : null}
        </div>
      )}
      {errorLine}
    </section>
  );
}
