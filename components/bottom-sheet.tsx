"use client";

import { ChevronLeft, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { lockPageScroll, useSheetDrag } from "./sheet-drag";
import { cx } from "./ui";

/** What Tab steps through in the sheet. */
const TABBABLE = ':is(button, input, select, textarea, a[href]):not(:disabled):not([tabindex="-1"])';

/**
 * A bottom sheet on phones, a dialog from `sm` up, like the limit sheet: swipe down by the grabber or tap the
 * backdrop to close; Escape closes (unless something inside handled it first); Tab stays inside. Focus starts on
 * `initialFocus` (else the first field or button) and goes back where it was on close. `onClose` must be stable
 * (useCallback), or the sheet would refocus on every render.
 */
export function BottomSheet({
  id,
  title,
  onClose,
  initialFocus,
  footer,
  children,
}: {
  /** Prefix for the title's id. */
  id: string;
  title: ReactNode;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Stays put below the scrolling body (a Save button). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    const first = initialFocus?.current ?? sheetRef.current?.querySelector<HTMLElement>(`input, select, textarea, ${TABBABLE}`);
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Escape while an IME is composing (229: Safari's key code for it) cancels the composition, not the sheet.
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229) onClose();
      if (e.key !== "Tab" || !sheetRef.current) return;
      // Moves focus itself on every Tab: Safari leaves buttons out of the Tab order.
      e.preventDefault();
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(TABBABLE)];
      if (!focusable.length) return;
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      const step = e.shiftKey ? -1 : 1;
      const next = at === -1 ? (e.shiftKey ? focusable.length - 1 : 0) : (at + step + focusable.length) % focusable.length;
      focusable[next].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose, initialFocus]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full min-w-0 flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex min-w-0 items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id={`${id}-title`} className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="glass relative grid size-9 shrink-0 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
            >
              <X size={18} />
            </button>
          </header>
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto px-5 pt-2", footer ? "pb-1" : "pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6")}>
          {children}
        </div>
        {footer ? <div className="shrink-0 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The sheets' main button: "Save", full width. */
export const SHEET_BUTTON =
  "h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-canvas transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-60";

/** A text field in a sheet. */
export const SHEET_FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15 disabled:opacity-60";

/** A field's label. */
export function SheetLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-2">
      {children}
    </label>
  );
}

/** The back button on top of a settings page: back in the app, or to Settings when opened directly. */
export function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 bg-canvas/85 px-4 pt-safe pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-8 lg:backdrop-blur-none">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="glass relative grid size-10 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
      >
        <ChevronLeft size={22} />
      </button>
    </div>
  );
}

/** The round + button at the bottom right of a settings page. */
export const FAB =
  "glass-tint fixed right-5 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-30 grid size-14 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50 lg:right-10 lg:bottom-10";
