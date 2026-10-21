"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Txn } from "@/lib/analytics";
import { CATEGORY_NAMES } from "@/lib/categories";
import { parseAmountInput } from "@/lib/format";
import type { TxType } from "@/lib/types";

import { useData } from "./data-provider";
import { useSheetDrag } from "./sheet-drag";
import { Segmented } from "./ui";

const AUTO = "";
const FIELD =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15";

/** "2026-10-22T14:05" in this device's time zone, for <input type="datetime-local">. */
function localInputValue(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Add a transaction by hand (cash, or anything without an SMS): bottom sheet on phones, dialog on desktop. */
export function AddTransactionSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (txn: Txn) => void }) {
  const { addTransaction } = useData();
  const sheetRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [openedAt] = useState(() => Date.now());
  const [type, setType] = useState<TxType>("DEBIT");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState(AUTO);
  const [when, setWhen] = useState(() => localInputValue(openedAt));
  const [paidWith, setPaidWith] = useState<"bank" | "cash">("bank");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const debit = type === "DEBIT";
  /** Any edit clears the last error; it's re-checked on submit. */
  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
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
    const value = parseAmountInput(amount);
    if (value === null || Number(value) <= 0) return setError("Enter an amount, like 250 or 249.50.");
    const name = merchant.trim();
    if (!name) return setError(debit ? "Enter who you paid." : "Enter who paid you.");
    // Untouched means "now": send the exact time, not the minute the sheet opened.
    const time = when === localInputValue(openedAt) ? new Date() : new Date(when);
    if (Number.isNaN(time.getTime())) return setError("Pick a date and time.");
    if (time.getTime() > Date.now() + 60_000) return setError("The date and time can't be in the future.");
    setSaving(true);
    setError(null);
    try {
      const txn = await addTransaction({
        type,
        amount: value,
        merchant: name,
        category: category || null,
        transaction_time: time.toISOString(),
        paid_with: paidWith,
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
          <Segmented
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "DEBIT", label: "Expense" },
              { value: "CREDIT", label: "Income" },
            ]}
          />

          <label className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-violet/50 focus-within:ring-4 focus-within:ring-violet/15">
            <span className="text-2xl font-semibold text-ink-3" aria-hidden>
              ₹
            </span>
            <input
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="0"
              aria-label="Amount in rupees"
              value={amount}
              onChange={(e) => edit(setAmount)(e.target.value)}
              className="h-16 w-full min-w-0 bg-transparent text-[32px] font-bold tracking-tight text-ink tabular-nums outline-none placeholder:text-ink-3"
            />
          </label>

          <Field id="add-merchant" label={debit ? "Paid to" : "Received from"}>
            <input
              id="add-merchant"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              maxLength={100}
              placeholder={debit ? "e.g. Chai Point, auto rickshaw" : "e.g. Freelance project, Priya"}
              value={merchant}
              onChange={(e) => edit(setMerchant)(e.target.value)}
              className={FIELD}
            />
          </Field>

          <Field id="add-category" label="Category">
            <div className="relative">
              <select
                id="add-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${FIELD} appearance-none truncate pr-9`}
              >
                <option value={AUTO}>Auto (from the name)</option>
                {CATEGORY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-2" aria-hidden />
            </div>
          </Field>
          <Field id="add-when" label="Date & time">
            <input
              id="add-when"
              type="datetime-local"
              value={when}
              max={localInputValue(openedAt + 5 * 60_000)}
              onChange={(e) => edit(setWhen)(e.target.value)}
              className={`${FIELD} appearance-none [&::-webkit-date-and-time-value]:text-left`}
            />
          </Field>

          <div className="mt-4">
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">{debit ? "Paid from" : "Received in"}</p>
            <Segmented
              label={debit ? "Paid from" : "Received in"}
              value={paidWith}
              onChange={setPaidWith}
              options={[
                { value: "bank", label: "Bank account" },
                { value: "cash", label: "Cash" },
              ]}
            />
            <p className="mt-2 text-[13px] text-ink-2">
              {paidWith === "cash"
                ? "Counts in your spending and limits, but not in Balance left: cash never goes through the bank."
                : "Moves your Balance left, just like a bank SMS."}
            </p>
          </div>

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
            {saving ? "Adding…" : debit ? "Add expense" : "Add income"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}
