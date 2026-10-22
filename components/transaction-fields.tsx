"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { CATEGORY_NAMES, UNCATEGORIZED } from "@/lib/categories";
import { parseAmountInput } from "@/lib/format";
import type { TxType } from "@/lib/types";

import { Segmented } from "./ui";

/** The "Auto (from the name)" category: the server picks it. */
export const AUTO = "";

const FIELD =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15";

/** "2026-10-22T14:05" in this device's time zone, for <input type="datetime-local">. */
export function localInputValue(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the form holds, as typed. */
export interface Draft {
  type: TxType;
  amount: string;
  merchant: string;
  category: string;
  when: string;
  paidWith: "bank" | "cash";
}

/** Checks a draft; `nameRequired` is off when editing a transaction that never had a name. */
export function readDraft(draft: Draft, nameRequired = true): { error: string } | { amount: string; merchant: string; time: Date } {
  const amount = parseAmountInput(draft.amount);
  if (amount === null || Number(amount) <= 0) return { error: "Enter an amount, like 250 or 249.50." };
  const merchant = draft.merchant.trim();
  if (!merchant && nameRequired) return { error: draft.type === "DEBIT" ? "Enter who you paid." : "Enter who paid you." };
  const time = new Date(draft.when);
  if (Number.isNaN(time.getTime())) return { error: "Pick a date and time." };
  if (time.getTime() > Date.now() + 60_000) return { error: "The date and time can't be in the future." };
  return { amount, merchant, time };
}

/**
 * Type, amount, name, category, date and (for entries added by hand) bank or cash.
 * Shared by Activity → Add and the Edit mode of a transaction's detail sheet.
 */
export function TransactionFields({
  idPrefix,
  draft,
  onChange,
  amountRef,
  maxWhen,
  autoCategory = false,
  showPaidWith = false,
  categoryHint,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  amountRef?: Ref<HTMLInputElement>;
  maxWhen: string;
  /** Offer "Auto (from the name)" (adding) instead of "Uncategorized" (editing). */
  autoCategory?: boolean;
  showPaidWith?: boolean;
  categoryHint?: string | null;
}) {
  const debit = draft.type === "DEBIT";
  return (
    <>
      <Segmented
        label="Type"
        value={draft.type}
        onChange={(type) => onChange({ type })}
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
          value={draft.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          className="h-16 w-full min-w-0 bg-transparent text-[32px] font-bold tracking-tight text-ink tabular-nums outline-none placeholder:text-ink-3"
        />
      </label>

      <Field id={`${idPrefix}-merchant`} label={debit ? "Paid to" : "Received from"}>
        <input
          id={`${idPrefix}-merchant`}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          maxLength={100}
          placeholder={debit ? "e.g. Chai Point, auto rickshaw" : "e.g. Freelance project, Priya"}
          value={draft.merchant}
          onChange={(e) => onChange({ merchant: e.target.value })}
          className={FIELD}
        />
      </Field>

      <Field id={`${idPrefix}-category`} label="Category">
        <div className="relative">
          <select
            id={`${idPrefix}-category`}
            value={draft.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className={`${FIELD} appearance-none truncate pr-9`}
          >
            {autoCategory ? <option value={AUTO}>Auto (from the name)</option> : null}
            {CATEGORY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {autoCategory ? null : <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-2" aria-hidden />
        </div>
        {categoryHint ? <p className="mt-2 text-[13px] text-ink-2">{categoryHint}</p> : null}
      </Field>

      <Field id={`${idPrefix}-when`} label="Date & time">
        <input
          id={`${idPrefix}-when`}
          type="datetime-local"
          value={draft.when}
          max={maxWhen}
          onChange={(e) => onChange({ when: e.target.value })}
          className={`${FIELD} appearance-none [&::-webkit-date-and-time-value]:text-left`}
        />
      </Field>

      {showPaidWith ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">{debit ? "Paid from" : "Received in"}</p>
          <Segmented
            label={debit ? "Paid from" : "Received in"}
            value={draft.paidWith}
            onChange={(paidWith) => onChange({ paidWith })}
            options={[
              { value: "bank", label: "Bank account" },
              { value: "cash", label: "Cash" },
            ]}
          />
          <p className="mt-2 text-[13px] text-ink-2">
            {draft.paidWith === "cash"
              ? "Counts in your spending and limits, but not in Balance left: cash never goes through the bank."
              : "Moves your Balance left, just like a bank SMS."}
          </p>
        </div>
      ) : null}
    </>
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
