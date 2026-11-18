"use client";

import Link from "next/link";
import { Check, ChevronRight, Copy, MessageSquareText, NotebookPen, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { carriedForward, isHeldOut, merchantKey, parsedByLabel, type Txn } from "@/lib/analytics";
import { mergeMerchantName } from "@/lib/api";
import { CASH_ACCOUNT, MANUAL, UNCATEGORIZED, categoryName } from "@/lib/categories";
import { dateTimeLabel, formatMoney, monthLabel, shortDayLabel, timeLabel } from "@/lib/format";
import { allTags, insertTag, partialTagAt, suggestTags } from "@/lib/tags";
import type { TransactionPatch } from "@/lib/types";

import { useData } from "./data-provider";
import { lockPageScroll, useSheetDrag } from "./sheet-drag";
import { TransactionFields, localInputValue, readDraft, type Draft } from "./transaction-fields";
import { TagChips, transactionTitle } from "./transactions";
import { Amount, CategoryTile, CheckRow, cx } from "./ui";
import { RULES_PAGE } from "./views/rules";

/** iOS navigation-bar capsule: "Edit", "Cancel", "Done". */
const CAPSULE =
  "h-9 rounded-full px-4 text-[15px] font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60";
/** Round glass button in the bar: close and delete. Each adds its own position (the glass rim needs one). */
const ROUND =
  "glass grid size-9 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet";

export function TransactionSheet() {
  const { selected } = useData();
  // Keyed by transaction, so opening another one never starts in Edit mode.
  return selected ? <SheetBody key={selected.id} t={selected} /> : null;
}

/** The form's starting point: the transaction as it is now. */
function draftOf(t: Txn): Draft {
  return {
    type: t.type,
    amount: t.is_parsed ? String(t.amount) : "",
    merchant: t.is_parsed || t.merchant !== "Unknown" ? (t.merchant ?? "") : "",
    category: categoryName(t),
    when: localInputValue(t.time),
    paidWith: t.account_ref === CASH_ACCOUNT ? "cash" : "bank",
  };
}

function SheetBody({ t }: { t: Txn }) {
  const { closeTransaction, updateTransaction, deleteTransaction, refresh, txns } = useData();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(dialogRef, closeTransaction);
  const closeRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [openedAt] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null); // set while editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState(false); // "Not a duplicate" just succeeded
  const [mergeAll, setMergeAll] = useState(false); // "Also rename the other payments named …"
  const editing = draft !== null;
  const editingRef = useRef(false);
  const debit = t.type === "DEBIT";
  const manual = t.parsed_by === MANUAL;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // the note box handled it
      if (e.key === "Escape") {
        // Like iOS: Escape backs out of editing first, then closes.
        if (editingRef.current) {
          setDraft(null);
          setError(null);
        } else {
          closeTransaction();
        }
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
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
      previouslyFocused?.focus?.();
    };
  }, [closeTransaction]);

  // Entering Edit focuses the amount; leaving it puts focus back on Edit.
  useEffect(() => {
    if (editing) amountRef.current?.focus({ preventScroll: true });
    else if (editingRef.current) editRef.current?.focus();
    editingRef.current = editing;
  }, [editing]);

  const copyReference = async () => {
    if (!t.reference_id) return;
    try {
      await navigator.clipboard.writeText(t.reference_id);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const startEditing = () => {
    setDraft(draftOf(t));
    setError(null);
    setKept(false); // said once; don't repeat it on the way back from Edit
    setMergeAll(false);
  };
  const cancelEditing = () => {
    setDraft(null);
    setError(null);
    setMergeAll(false);
  };
  const change = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setError(null);
  };

  // A new name for a payment that has one offers to rename every payment with the old name (any case).
  const fromKey = merchantKey(t.merchant);
  const typed = draft?.merchant.trim() ?? "";
  const renaming = draft !== null && fromKey !== null && typed !== "" && typed !== draftOf(t).merchant;
  // Other loaded payments with the same name (as the server compares names) that aren't already the new name.
  const others = useMemo(() => {
    if (!renaming) return 0;
    const target = typed.normalize("NFC").replace(/\s+/g, " ");
    return txns.filter((o) => o.id !== t.id && merchantKey(o.merchant) === fromKey && o.merchant !== target).length;
  }, [renaming, typed, txns, t.id, fromKey]);
  const quoted = `“${t.merchant ?? ""}”`;
  const mergeText =
    others === 0
      ? `Also rename future payments named ${quoted} (any case)`
      : `Also rename the ${others} other ${others === 1 ? "payment" : "payments"} named ${quoted} (any case), and future ones`;

  // Sends only what changed.
  const save = async () => {
    if (!draft) return;
    const original = draftOf(t);
    const checked = readDraft(draft, original.merchant !== "");
    if ("error" in checked) return setError(checked.error);
    const patch: TransactionPatch = {};
    if (draft.type !== original.type) patch.type = draft.type;
    if (Number(checked.amount) !== (t.is_parsed ? t.amount : 0)) patch.amount = checked.amount;
    if (checked.merchant && checked.merchant !== original.merchant) patch.merchant = checked.merchant;
    if (draft.category !== original.category) patch.category = draft.category;
    if (draft.when !== original.when) patch.transaction_time = checked.time.toISOString();
    if (manual && draft.paidWith !== original.paidWith) patch.paid_with = draft.paidWith;
    if (Object.keys(patch).length === 0) return cancelEditing();
    if (renaming && mergeAll && t.merchant) return saveMerged(t.merchant, checked.merchant, patch);
    setSaving(true);
    setError(null);
    try {
      await updateTransaction(t.id, patch);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Renames every payment named `from` (this one included) and future ones, then sends the other
   * changed fields, then reloads every transaction. "Saving…" stays until the reload is done.
   */
  const saveMerged = async (from: string, to: string, patch: TransactionPatch) => {
    setSaving(true);
    setError(null);
    try {
      try {
        await mergeMerchantName(from, to);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't rename these payments.");
        return;
      }
      const rest = { ...patch };
      delete rest.merchant; // the merge renamed this payment too
      let saved = true;
      if (Object.keys(rest).length) {
        try {
          await updateTransaction(t.id, rest);
        } catch (err) {
          saved = false;
          setError(err instanceof Error ? err.message : "Couldn't save your other changes.");
        }
      }
      await refresh();
      if (saved) {
        setDraft(null);
        setMergeAll(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const name = draft?.merchant.trim() || t.merchant || "";
  const recategorised = draft !== null && draft.category !== categoryName(t);
  const categoryHint = !recategorised
    ? null
    : t.parsed_by === "regex+rule" // a category rule set it: the rule, not this edit, decides future payments
      ? "Changes this payment only. Future payments like this follow your category rule."
      : !name
        ? null
        : draft.category === UNCATEGORIZED
          ? `Folio will pick categories for ${name} itself again.`
          : `${draft.type === "DEBIT" ? "Future payments to" : "Future money from"} ${name} will be ${draft.category} too.`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={closeTransaction} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={editing ? "edit-title" : "txn-title"}
        className="animate-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[32px] bg-canvas pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-float sm:max-w-md sm:rounded-[32px] sm:pb-5"
      >
        {/* Navigation bar, iOS style: Edit / Cancel on the left, close / Done on the right.
            Also the grabber: swipe down here to close (phones). */}
        <div {...grabProps} className="sticky top-0 z-10 h-[60px] touch-none bg-canvas/90 backdrop-blur select-none">
          <span className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          {editing ? (
            <>
              <button type="button" onClick={cancelEditing} disabled={saving} className={cx(CAPSULE, "glass absolute top-[18px] left-4 text-ink")}>
                Cancel
              </button>
              <h2 id="edit-title" className="pointer-events-none absolute top-[18px] left-1/2 flex h-9 -translate-x-1/2 items-center text-[15px] font-semibold whitespace-nowrap text-ink">
                Edit transaction
              </h2>
              <button type="button" onClick={save} disabled={saving} className={cx(CAPSULE, "glass-tint absolute top-[18px] right-4")}>
                {saving ? "Saving…" : "Done"}
              </button>
            </>
          ) : (
            <>
              <div className="absolute top-[18px] left-4 flex items-center gap-2">
                <button ref={editRef} type="button" onClick={startEditing} className={cx(CAPSULE, "glass relative text-ink")}>
                  Edit
                </button>
                {/* Deletes at once, with Undo for a few seconds (bar above the tabs). */}
                <button type="button" onClick={() => deleteTransaction(t.id)} aria-label="Delete transaction" title="Delete" className={cx(ROUND, "relative text-expense")}>
                  <Trash2 size={17} />
                </button>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeTransaction}
                aria-label="Close details"
                className={cx(ROUND, "absolute top-[18px] right-4 text-ink")}
              >
                <X size={18} />
              </button>
            </>
          )}
        </div>

        {draft ? (
          <div className="px-5 pt-1">
            <TransactionFields
              idPrefix="edit"
              draft={draft}
              onChange={change}
              amountRef={amountRef}
              maxWhen={localInputValue(openedAt + 5 * 60_000)}
              showPaidWith={manual}
              categoryHint={categoryHint}
              merchantNote={
                renaming ? (
                  <CheckRow checked={mergeAll} onChange={setMergeAll} disabled={saving}>
                    {mergeText}
                  </CheckRow>
                ) : null
              }
            />
            {error ? (
              <p role="alert" className="mt-3 text-[13px] font-medium text-expense">
                {error}
              </p>
            ) : null}
            {manual ? null : <OriginalSms text={t.raw_message} />}
          </div>
        ) : (
          <div className="px-5">
            <div className="flex flex-col items-center pb-6 text-center">
              <CategoryTile name={categoryName(t)} size="lg" />
              <h2 id="txn-title" className="mt-3 max-w-full truncate text-lg font-semibold text-ink">
                {transactionTitle(t)}
              </h2>
              {t.is_parsed ? (
                <Amount
                  minor={t.minor}
                  currency={t.currency}
                  sign={debit ? "−" : "+"}
                  className={cx("mt-1 text-4xl font-bold tracking-tight", debit ? "text-ink" : "text-income")}
                />
              ) : (
                <p className="mt-2 rounded-full bg-warn-soft px-3 py-1 text-sm font-medium text-warn">
                  Couldn&apos;t read this SMS automatically
                </p>
              )}
              <p className="mt-2 text-sm text-ink-2">{dateTimeLabel(t.transaction_time)}</p>
            </div>

            {isHeldOut(t) ? (
              <DuplicateCard
                t={t}
                onKept={() => {
                  // The card (and its focused button) goes away: land on Close instead of <body>, and say it worked.
                  closeRef.current?.focus();
                  setKept(true);
                }}
              />
            ) : null}
            {/* Always mounted, so the message is announced when it appears. */}
            <div role="status">
              {kept && !isHeldOut(t) ? (
                <p className="mb-4 flex items-center gap-1.5 rounded-card bg-income-soft px-4 py-3 text-[13px] font-medium text-income">
                  <Check size={15} className="shrink-0" aria-hidden />
                  Not a duplicate: counted again.
                </p>
              ) : null}
            </div>

            <dl className="divide-y divide-line rounded-card border border-line/70 bg-surface px-4 shadow-card">
              <Row label="Type">{debit ? "Money out" : "Money in"}</Row>
              <Row
                label="Category"
                note={
                  t.parsed_by === "regex+rule" ? (
                    <>
                      Set by one of your category rules. Future payments like this follow it.{" "}
                      {/* The sheet sits in the app shell: close it, or it stays open over the rules page. */}
                      <Link href={RULES_PAGE} onClick={closeTransaction} className="font-medium text-violet-strong">
                        Names and rules
                      </Link>
                    </>
                  ) : null
                }
              >
                {categoryName(t)}
              </Row>
              {carriedForward(t) ? <Row label="Counts toward">{monthLabel(t.countsIn)}</Row> : null}
              {t.account_ref ? <Row label="Account">{t.account_ref}</Row> : null}
              {t.balance !== null ? (
                // The SMS's "Avl Bal": one account's balance, or a card's limit left (never Balance left).
                <Row label={t.balance_kind === "card" ? "Card limit left in SMS" : t.balance_kind === "bank" ? "Bank balance in SMS" : "Balance in SMS"}>
                  {formatMoney(Math.round(t.balance * 100), t.currency)}
                </Row>
              ) : null}
              {t.reference_id ? (
                <Row label="Reference">
                  <button
                    type="button"
                    onClick={copyReference}
                    className="inline-flex max-w-full items-center gap-1.5 font-mono text-[13px] hover:text-violet"
                    aria-label={`Copy reference ${t.reference_id}`}
                  >
                    <span className="truncate">{t.reference_id}</span>
                    {copied ? <Check size={14} className="text-income" /> : <Copy size={14} className="text-ink-3" />}
                  </button>
                </Row>
              ) : null}
              {t.sender ? <Row label="Sender">{t.sender}</Row> : null}
              <Row label={manual ? "Added by" : "Read by"}>{parsedByLabel(t)}</Row>
            </dl>

            <NoteCard t={t} />
            {manual ? null : <OriginalSms text={t.raw_message} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** A possible duplicate: what it may duplicate, and the two choices. Held out of every total until one is made. */
function DuplicateCard({ t, onKept }: { t: Txn; onKept: () => void }) {
  const { txns, openTransaction, deleteTransaction, markNotDuplicate } = useData();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not loaded (or deleted, waiting for Undo): no link, just the plain line.
  const original = txns.find((o) => o.id === t.duplicate_of) ?? null;
  const when = original
    ? original.day === t.day
      ? timeLabel(original.transaction_time)
      : `${shortDayLabel(original.day)}, ${timeLabel(original.transaction_time)}`
    : "";

  // On success the row comes back with `duplicate_of: null`, so this card goes and the sheet stays open.
  const keep = async () => {
    setSaving(true);
    setError(null);
    try {
      await markNotDuplicate(t.id);
      onKept();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Possible duplicate" className="mb-4 rounded-card border border-warn/30 bg-warn-soft p-4">
      {original ? (
        <button
          type="button"
          onClick={() => openTransaction(original.id)}
          className="flex w-full min-w-0 items-center gap-1.5 text-left text-[15px] font-semibold text-warn focus-visible:outline-2 focus-visible:outline-violet"
        >
          <span className="min-w-0 break-words">
            Possible duplicate of {formatMoney(original.minor, original.currency)} at {transactionTitle(original)}, {when}
          </span>
          <ChevronRight size={16} className="shrink-0" aria-hidden />
        </button>
      ) : (
        <p className="text-[15px] font-semibold text-warn">Possible duplicate of an earlier transaction</p>
      )}
      <p className="mt-1 text-[13px] text-ink-2">It isn&apos;t counted in your totals until you decide.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* The usual delete: closes the sheet and offers Undo. */}
        <button
          type="button"
          onClick={() => deleteTransaction(t.id)}
          disabled={saving}
          className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-canvas transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50"
        >
          Delete duplicate
        </button>
        <button
          type="button"
          onClick={() => void keep()}
          disabled={saving}
          className="h-9 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50"
        >
          {saving ? "Saving…" : "Not a duplicate"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Matches `MAX_NOTE_LENGTH` in the backend's main.py. */
const MAX_NOTE = 500;

/** Your own note on a transaction: where it was, what it was for. Added and changed in place. */
function NoteCard({ t }: { t: Txn }) {
  const { updateTransaction, txns } = useData();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<string | null>(null); // set while writing
  const [caret, setCaret] = useState(0); // where the caret is in `draft`, for tag suggestions
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writing = draft !== null;
  const writingRef = useRef(false);
  const note = t.notes ?? "";
  const known = useMemo(() => allTags(txns), [txns]);
  // A tag being typed just before the caret ("#g") suggests existing ones ("#goa (18)").
  const typing = writing && !saving ? partialTagAt(draft, caret) : null;
  const suggestions = typing ? suggestTags(known, typing.partial) : [];

  // Writing focuses the box with the caret at the end; finishing puts focus back on the button.
  useEffect(() => {
    const area = areaRef.current;
    if (writing && area) {
      area.focus({ preventScroll: true });
      area.setSelectionRange(area.value.length, area.value.length);
      area.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (writingRef.current) {
      addRef.current?.focus();
    }
    writingRef.current = writing;
  }, [writing]);

  const stop = () => {
    setDraft(null);
    setError(null);
  };
  const save = async (text: string) => {
    const next = text.trim();
    if (next === note) return stop();
    setSaving(true);
    setError(null);
    try {
      await updateTransaction(t.id, { notes: next });
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your note.");
    } finally {
      setSaving(false);
    }
  };

  if (!writing && !note) {
    return (
      <button
        ref={addRef}
        type="button"
        onClick={() => {
          setDraft("");
          setCaret(0);
        }}
        className="mt-4 flex w-full items-center gap-2 rounded-card border border-dashed border-line bg-surface/60 px-4 py-3.5 text-left text-sm font-medium text-violet transition hover:border-violet/40 focus-visible:outline-2 focus-visible:outline-violet"
      >
        <Plus size={16} aria-hidden /> Add a note
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-line/70 bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <NotebookPen size={16} aria-hidden /> Note
        </p>
        {writing ? null : (
          <button
            ref={addRef}
            type="button"
            onClick={() => {
              setDraft(note);
              setCaret(note.length);
            }}
            aria-label="Edit note"
            className="-my-1 rounded-full px-2 py-1 text-sm font-semibold text-violet focus-visible:outline-2 focus-visible:outline-violet"
          >
            Edit
          </button>
        )}
      </div>
      {writing ? (
        <>
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setCaret(e.target.selectionStart);
              setError(null);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault(); // keeps the sheet open
                stop();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save(draft);
              }
            }}
            maxLength={MAX_NOTE}
            rows={3}
            disabled={saving}
            aria-label="Note"
            placeholder="Where was this, and what was it for?"
            className="block w-full resize-none rounded-2xl border border-line bg-canvas px-3.5 py-3 text-[16px] leading-snug text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
          />
          {error ? (
            <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          {typing && suggestions.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Tag suggestions">
              {suggestions.map(({ tag, count }) => {
                const next = insertTag(draft, typing.start, caret, tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={next.text.length > MAX_NOTE}
                    onMouseDown={(e) => e.preventDefault()} // keeps the caret in the note on desktop
                    onClick={() => {
                      flushSync(() => {
                        setDraft(next.text);
                        setCaret(next.caret);
                      });
                      const area = areaRef.current;
                      area?.focus({ preventScroll: true });
                      area?.setSelectionRange(next.caret, next.caret);
                    }}
                    className="h-8 max-w-full truncate rounded-full border border-line bg-canvas px-3 text-[13px] font-medium text-violet-strong transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50"
                  >
                    #{tag} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            {note ? (
              <button type="button" onClick={() => save("")} disabled={saving} className={cx(CAPSULE, "px-2 text-expense")}>
                Remove
              </button>
            ) : null}
            <span className={cx("ml-auto text-[12px] tabular-nums text-ink-3", draft.length < MAX_NOTE - 100 && "invisible")} aria-hidden>
              {MAX_NOTE - draft.length} left
            </span>
            <button type="button" onClick={stop} disabled={saving} className={cx(CAPSULE, "glass relative text-ink")}>
              Cancel
            </button>
            <button type="button" onClick={() => save(draft)} disabled={saving} className={cx(CAPSULE, "glass-tint relative")}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">{note}</p>
          <TagChips tags={t.tags} className="mt-3" />
        </>
      )}
    </div>
  );
}

function OriginalSms({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-card border border-line/70 bg-surface p-4 shadow-card">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-2">
        <MessageSquareText size={16} aria-hidden /> Original SMS
      </p>
      <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink">{text}</p>
    </div>
  );
}

/** A detail line; `note` adds a full-width line under it (a second <dd>, still valid list markup). */
function Row({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className={note ? "flex flex-wrap items-center justify-between gap-x-4 py-3.5" : "flex items-center justify-between gap-4 py-3.5"}>
      <dt className="shrink-0 text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-ink">{children}</dd>
      {note ? <dd className="mt-1 w-full text-left text-[13px] font-normal whitespace-normal text-ink-2">{note}</dd> : null}
    </div>
  );
}
