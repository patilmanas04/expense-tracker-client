"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";

import { lockPageScroll, useSheetDrag } from "./sheet-drag";
import type { AmountText } from "./views/activity";

const INPUT =
  "h-12 w-full min-w-0 rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink tabular-nums outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15 aria-invalid:border-expense/60";
const CAPSULE =
  "h-10 rounded-full px-5 text-[15px] font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50";

/**
 * Activity's less common filters (an amount range): bottom sheet on phones, dialog on desktop.
 * It edits Activity's text live, so there is no Apply button.
 */
export function MoreFiltersSheet({
  amountText,
  error,
  onChange,
  onClose,
}: {
  amountText: AmountText;
  error: string | null;
  onChange: (next: AmountText) => void;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [keyboard, setKeyboard] = useState(0);
  const empty = !amountText.min && !amountText.max;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    minRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input");
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

  const field = (side: keyof AmountText, label: string, ref?: Ref<HTMLInputElement>) => (
    <div className="min-w-0">
      <label htmlFor={`filter-${side}`} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <input
        ref={ref}
        id={`filter-${side}`}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="Any"
        value={amountText[side]}
        onChange={(e) => onChange({ ...amountText, [side]: e.target.value })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "filter-amount-error" : undefined}
        className={INPUT}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-filters-title"
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id="more-filters-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              More filters
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6">
          <p className="text-sm font-medium text-ink-2">Amount</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {field("min", "At least", minRef)}
            {field("max", "At most")}
          </div>
          {error ? (
            <p id="filter-amount-error" role="alert" className="mt-2 text-[13px] font-medium text-expense">
              {error}. This filter is off until it&apos;s fixed.
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-ink-2">Compared with each payment&apos;s full amount, in its own currency.</p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ min: "", max: "" })}
              disabled={empty}
              className={`${CAPSULE} glass relative text-ink`}
            >
              Clear
            </button>
            <button type="button" onClick={onClose} className={`${CAPSULE} glass-tint relative ml-auto`}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
