"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { Txn } from "@/lib/analytics";

import { useData } from "./data-provider";
import { useSheetDrag } from "./sheet-drag";
import { AUTO, TransactionFields, localInputValue, readDraft, type Draft } from "./transaction-fields";

/** Add a transaction by hand (cash, or anything without an SMS): bottom sheet on phones, dialog on desktop. */
export function AddTransactionSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (txn: Txn) => void }) {
  const { addTransaction } = useData();
  const sheetRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [openedAt] = useState(() => Date.now());
  const [draft, setDraft] = useState<Draft>(() => ({
    type: "DEBIT",
    amount: "",
    merchant: "",
    category: AUTO,
    when: localInputValue(openedAt),
    paidWith: "bank",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  // Any change clears the last error; it's re-checked on submit.
  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    amountRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, select");
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
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  // iOS leaves fixed elements behind the on-screen keyboard; lift the sheet above it.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = readDraft(draft);
    if ("error" in checked) return setError(checked.error);
    // Untouched means "now": send the exact time, not the minute the sheet opened.
    const time = draft.when === localInputValue(openedAt) ? new Date() : checked.time;
    setSaving(true);
    setError(null);
    try {
      const txn = await addTransaction({
        type: draft.type,
        amount: checked.amount,
        merchant: checked.merchant,
        category: draft.category || null,
        transaction_time: time.toISOString(),
        paid_with: draft.paidWith,
      });
      onAdded(txn);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the transaction.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id="add-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              Add transaction
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="glass relative grid size-9 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
            >
              <X size={18} />
            </button>
          </header>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6"
        >
          <TransactionFields
            idPrefix="add"
            draft={draft}
            onChange={change}
            amountRef={amountRef}
            maxWhen={localInputValue(openedAt + 5 * 60_000)}
            autoCategory
            showPaidWith
          />

          {error ? (
            <p role="alert" className="mt-3 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-canvas transition active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Adding…" : draft.type === "DEBIT" ? "Add expense" : "Add income"}
          </button>
        </form>
      </div>
    </div>
  );
}
