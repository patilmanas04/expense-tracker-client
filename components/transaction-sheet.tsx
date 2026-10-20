"use client";

import { Check, Copy, MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { parsedByLabel } from "@/lib/analytics";
import { categoryName } from "@/lib/categories";
import { dateTimeLabel, formatMoney } from "@/lib/format";

import { useData } from "./data-provider";
import { transactionTitle } from "./transactions";
import { Amount, CategoryTile, cx } from "./ui";

export function TransactionSheet() {
  const { selected: t, closeTransaction } = useData();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!t) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTransaction();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
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
      setCopied(false);
      previouslyFocused?.focus?.();
    };
  }, [t, closeTransaction]);

  if (!t) return null;

  const debit = t.type === "DEBIT";
  const copyReference = async () => {
    if (!t.reference_id) return;
    try {
      await navigator.clipboard.writeText(t.reference_id);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeTransaction} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-title"
        className="animate-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[32px] bg-canvas pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-float sm:max-w-md sm:rounded-[32px] sm:pb-5"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-canvas/90 px-5 pt-3 pb-2 backdrop-blur">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <button
            ref={closeRef}
            type="button"
            onClick={closeTransaction}
            aria-label="Close details"
            className="absolute top-3 right-4 grid size-9 place-items-center rounded-full bg-surface text-ink-2 shadow-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5">
          <div className="flex flex-col items-center pt-2 pb-6 text-center">
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
              <p className="mt-2 rounded-full bg-[#fff6db] px-3 py-1 text-sm font-medium text-[#9a6700]">
                Couldn&apos;t read this SMS automatically
              </p>
            )}
            <p className="mt-2 text-sm text-ink-2">{dateTimeLabel(t.transaction_time)}</p>
          </div>

          <dl className="divide-y divide-line rounded-card border border-line/70 bg-surface px-4 shadow-card">
            <Row label="Type">{debit ? "Money out" : "Money in"}</Row>
            <Row label="Category">{categoryName(t)}</Row>
            {t.account_ref ? <Row label="Account">{t.account_ref}</Row> : null}
            {t.balance !== null ? <Row label="Balance after">{formatMoney(Math.round(t.balance * 100), t.currency)}</Row> : null}
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
            <Row label="Read by">{parsedByLabel(t)}</Row>
          </dl>

          <div className="mt-4 rounded-card border border-line/70 bg-surface p-4 shadow-card">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-2">
              <MessageSquareText size={16} aria-hidden /> Original SMS
            </p>
            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink">{t.raw_message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <dt className="shrink-0 text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
