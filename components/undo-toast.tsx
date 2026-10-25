"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/format";

import { UNDO_MS, useData } from "./data-provider";
import { transactionTitle } from "./transactions";

/** "Deleted Zomato · −₹790.03  4s  Undo", just above the tab bar, while a delete can still be undone. */
export function UndoToast() {
  const { deletion, undoDelete, dismissDeletion } = useData();
  const failed = deletion?.status === "failed";
  // 0 until the first tick (reading the clock while rendering would break prerendering);
  // the cap below shows the full window until then.
  const [now, setNow] = useState(0);

  // Tick the countdown while Undo is on offer.
  useEffect(() => {
    if (deletion?.status !== "pending") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deletion]);

  // A failure message goes away on its own too.
  useEffect(() => {
    if (!failed) return;
    const id = window.setTimeout(dismissDeletion, UNDO_MS);
    return () => window.clearTimeout(id);
  }, [failed, dismissDeletion]);

  if (!deletion) return null;
  const { txn } = deletion;
  // Capped, so an unset or earlier clock reading never shows more than the full window.
  const secondsLeft = Math.min(UNDO_MS / 1000, Math.max(1, Math.ceil((deletion.until - now) / 1000)));
  const name = transactionTitle(txn);
  const amount = txn.is_parsed ? ` · ${formatMoney(txn.type === "DEBIT" ? -txn.minor : txn.minor, txn.currency, { signed: true })}` : "";
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+78px)] z-50 flex justify-center lg:bottom-6 lg:left-64">
      <div
        key={`${txn.id}:${deletion.status}`}
        role={failed ? "alert" : "status"}
        className="animate-sheet pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-sm text-canvas shadow-float"
      >
        <Trash2 size={16} className="shrink-0 text-canvas/70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{failed ? `Couldn't delete ${name}, so it's back.` : `Deleted ${name}${amount}`}</span>
        {failed ? (
          <button type="button" onClick={dismissDeletion} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-canvas/15">
            <X size={16} />
          </button>
        ) : (
          <>
            {/* Visual only: a screen reader would otherwise hear it every second. */}
            <span aria-hidden className="shrink-0 text-[13px] font-medium text-canvas/60 tabular-nums">
              {secondsLeft}s
            </span>
            <span className="sr-only">Undo is available for {UNDO_MS / 1000} seconds.</span>
            <button type="button" onClick={undoDelete} className="shrink-0 rounded-full bg-canvas/15 px-4 py-1.5 font-semibold hover:bg-canvas/25">
              Undo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
