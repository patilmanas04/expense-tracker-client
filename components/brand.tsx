import { useId } from "react";

import { cx } from "./ui";

/** Folio mark: a violet tile with a ledger "F" whose middle stroke is a rising bar. */
export function FolioMark({ className }: { className?: string }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 32 32" className={cx("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#AB86FF" />
          <stop offset="1" stopColor="#7243EC" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <rect x="9.5" y="8" width="4.4" height="16" rx="2.2" fill="#fff" />
      <rect x="9.5" y="8" width="13" height="4.4" rx="2.2" fill="#fff" />
      <rect x="9.5" y="14.6" width="9" height="4" rx="2" fill="#fff" fillOpacity="0.75" />
    </svg>
  );
}

export function Wordmark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <FolioMark />
      <span className={cx("text-xl font-bold tracking-tight", light ? "text-white" : "text-ink")}>Folio</span>
    </span>
  );
}
