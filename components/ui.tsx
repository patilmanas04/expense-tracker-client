"use client";

import { ChevronDown, Info, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { categoryMeta, tint } from "@/lib/categories";
import { formatPercent, moneyParts } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-card border border-line/70 bg-surface shadow-card", className)} {...props} />;
}

/** Big money figure with de-emphasised decimals: ₹42,124<span>.67</span> */
export function Amount({
  minor,
  currency,
  sign = "",
  className,
  fractionClassName = "opacity-45",
}: {
  minor: number;
  currency: string;
  sign?: string;
  className?: string;
  fractionClassName?: string;
}) {
  const { whole, fraction } = moneyParts(minor, currency);
  return (
    <span className={className}>
      {sign}
      {whole}
      <span className={fractionClassName}>{fraction}</span>
    </span>
  );
}

export function IconTile({
  icon: Icon,
  color,
  size = "md",
  round = false,
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: "sm" | "md" | "lg";
  round?: boolean;
  className?: string;
}) {
  const box = { sm: "size-10", md: "size-12", lg: "size-14" }[size];
  const glyph = { sm: 18, md: 20, lg: 24 }[size];
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center", round ? "rounded-full" : "rounded-2xl", box, className)}
      style={{ backgroundColor: tint(color, 0.1), color }}
    >
      <Icon size={glyph} strokeWidth={2.2} />
    </span>
  );
}

export function CategoryTile({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const meta = categoryMeta(name);
  return <IconTile icon={meta.icon} color={meta.color} size={size} />;
}

/**
 * Change badge. `upIsGood` decides the colour: more income is good, more spending isn't.
 * Always carries a sign and the comparison, so colour is never the only signal.
 */
export function DeltaPill({ change, upIsGood }: { change: number | null; upIsGood: boolean }) {
  if (change === null) {
    return <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-2">New</span>;
  }
  const flat = Math.abs(change) < 0.005;
  const good = change > 0 === upIsGood;
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        flat ? "bg-track text-ink-2" : good ? "bg-income-soft text-income" : "bg-expense-soft text-expense",
      )}
    >
      {flat ? "0%" : `${change > 0 ? "+" : "−"}${formatPercent(Math.abs(change))}`}
    </span>
  );
}

export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Native <select> styled as the reference's month pill (iOS shows its wheel picker). */
export function SelectPill({
  label,
  value,
  onChange,
  options,
  variant = "light",
  size = "md",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  variant?: "light" | "glass";
  size?: "md" | "sm";
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? label;
  return (
    <label
      className={cx(
        "relative inline-flex min-w-0 cursor-pointer items-center rounded-full font-medium transition focus-within:ring-2",
        size === "sm" ? "h-8 gap-1 px-3 text-[13px]" : "h-10 gap-1.5 px-4 text-sm",
        variant === "glass"
          ? "glass-on-color text-white focus-within:ring-white/60"
          : "border border-line bg-surface text-ink shadow-card hover:bg-raised focus-within:ring-violet/40",
        className,
      )}
    >
      <span className="truncate">{current}</span>
      <ChevronDown size={size === "sm" ? 14 : 16} strokeWidth={2.4} className="shrink-0 opacity-80" aria-hidden />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 16px stops iOS Safari zooming the page when the (invisible) select is tapped.
        className="absolute inset-0 cursor-pointer appearance-none text-base opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Two-option switch from the Report screen ("Expenses | Income"). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex rounded-full bg-track p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-10 flex-1 rounded-full text-[15px] font-medium transition",
              active ? "bg-raised text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-violet",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, picture, className }: { name: string; picture?: string | null; className?: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return picture ? (
    // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL, no optimisation needed
    <img
      src={picture}
      alt=""
      referrerPolicy="no-referrer"
      className={cx("size-11 rounded-full object-cover ring-2 ring-white/70", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cx(
        "grid size-11 place-items-center rounded-full bg-[#ffd9a8] text-sm font-semibold text-[#7a4300] ring-2 ring-white/70",
        className,
      )}
    >
      {initials || "F"}
    </span>
  );
}

/**
 * Tappable (i) with a short explanation; works with touch, mouse and keyboard.
 * The bubble is positioned against the nearest `relative` ancestor (e.g. the card) so it
 * stays inside it instead of hanging off the icon and past the screen edge.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Routes stay mounted while hidden; don't come back to an open bubble.
  useLayoutEffect(() => () => setOpen(false), []);

  return (
    <span ref={ref} className="inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={bubbleId}
        className={cx(
          "-m-1.5 grid size-7 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-violet",
          open ? "text-ink" : "text-ink-3 hover:text-ink-2",
        )}
      >
        <Info size={15} aria-hidden />
      </button>
      {open ? (
        <span
          id={bubbleId}
          role="note"
          className="animate-fade absolute top-[calc(100%-0.5rem)] right-2 left-2 z-30 rounded-2xl bg-ink px-3.5 py-2.5 text-left text-[13px] leading-snug font-normal text-canvas shadow-float"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: tint(color, 0.12) }}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
