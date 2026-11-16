"use client";

import { ChevronDown, ChevronLeft, Plus, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";

import { ALL_SPENDING, LIMIT_CATEGORIES } from "@/lib/categories";
import { formatMoney, formatPercent, parseAmountInput, shortDayLabel, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { LimitsInput, LimitsSummary, PeriodLimit } from "@/lib/types";

import { useData } from "../data-provider";
import { useSheetDrag } from "../sheet-drag";
import { SwipeToDelete } from "../swipe-to-delete";
import { Card, CategoryTile, IconTile, ProgressBar } from "../ui";

export const LIMITS_PAGE = "/settings/limits";

const limitText = (value: number | null) => (value === null ? "" : String(value));

/** The limits currently saved for "All spending" or one category. */
function limitsFor(summary: LimitsSummary | null, target: string) {
  if (!summary) return { weekly: null, monthly: null };
  if (target === ALL_SPENDING) return { weekly: summary.weekly.limit, monthly: summary.monthly.limit };
  const rule = summary.categories.find((c) => c.category === target);
  return { weekly: rule?.weekly.limit ?? null, monthly: rule?.monthly.limit ?? null };
}

const hasLimit = (summary: LimitsSummary | null, target: string) => {
  const { weekly, monthly } = limitsFor(summary, target);
  return weekly !== null || monthly !== null;
};

/** How many limits are set: "All spending" counts as one, plus each category. */
export const limitCount = (summary: LimitsSummary | null) =>
  summary ? summary.categories.length + (hasLimit(summary, ALL_SPENDING) ? 1 : 0) : 0;

/**
 * Settings → Manage spending limits. A page of its own: a back button on top, no tab bar,
 * and a + button to add a limit. Tap Edit on a limit to change it; swipe left to delete it.
 */
export function LimitsView() {
  const { limits: summary, saveLimits } = useData();
  const router = useRouter();
  const [editing, setEditing] = useState<{ target: string; adding: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stable, so the sheet's focus effect doesn't re-run (and steal focus) every time data refreshes.
  const closeSheet = useCallback(() => setEditing(null), []);

  // Back where you came from in the app; opened directly (a link, a reload), back to Settings.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  // + opens on the first thing without a limit: all spending, then the categories in order.
  // With every one set, there's nothing to add, so it edits the overall limit.
  const add = () => {
    const free = [ALL_SPENDING, ...LIMIT_CATEGORIES].find((name) => !hasLimit(summary, name));
    setEditing(free ? { target: free, adding: true } : { target: ALL_SPENDING, adding: false });
  };

  // Swipe left on a limit: a category's goes away; "All spending" keeps its meters, without limits.
  const deleteLimit = async (which: string) => {
    setError(null);
    try {
      await saveLimits({ category: which === ALL_SPENDING ? null : which, weekly_limit: null, monthly_limit: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that limit.");
      throw err; // the row comes back
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-8 lg:pb-12">
      {/* Only the back button up here, as in iOS Settings. */}
      <div className="sticky top-0 z-20 -mx-4 bg-canvas/85 px-4 pt-safe pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-8 lg:backdrop-blur-none">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="glass relative grid size-10 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Spending limits</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Reaching a limit sends one notification under the bell on Home, once per week (Mon–Sun) or month.
      </p>

      {summary ? (
        <>
          <Card className="mt-5 divide-y divide-line overflow-hidden">
            <LimitGroup
              name="All spending"
              tile={<IconTile icon={Wallet} color="#8458F5" size="sm" />}
              onEdit={() => setEditing({ target: ALL_SPENDING, adding: false })}
              onDelete={hasLimit(summary, ALL_SPENDING) ? () => deleteLimit(ALL_SPENDING) : undefined}
              stays
            >
              <LimitMeter title="This week" period={summary.weekly} currency={summary.currency} />
              <LimitMeter title="This month" period={summary.monthly} currency={summary.currency} />
            </LimitGroup>
          </Card>

          <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">By category</h2>
          {summary.categories.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {summary.categories.map((c) => (
                <LimitGroup
                  key={c.category}
                  name={c.category}
                  tile={<CategoryTile name={c.category} size="sm" />}
                  onEdit={() => setEditing({ target: c.category, adding: false })}
                  onDelete={() => deleteLimit(c.category)}
                >
                  {c.weekly.limit !== null ? <LimitMeter title="This week" period={c.weekly} currency={summary.currency} /> : null}
                  {c.monthly.limit !== null ? <LimitMeter title="This month" period={c.monthly} currency={summary.currency} /> : null}
                </LimitGroup>
              ))}
            </Card>
          ) : (
            <div className="rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] font-medium text-ink">No category limits yet</p>
              <p className="mt-1 text-[13px] text-ink-2">Tap + to limit one category, like Food &amp; Dining or Shopping.</p>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <p className="mt-3 px-1 text-[13px] text-ink-2">Swipe a limit left to delete it.</p>
        </>
      ) : (
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface" aria-label="Loading limits" />
      )}

      <button
        type="button"
        onClick={add}
        aria-label="Add spending limit"
        title="Add spending limit"
        className="glass-tint fixed right-5 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-30 grid size-14 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet lg:right-10 lg:bottom-10"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {editing ? (
        <LimitSheet
          // A fresh form for each opening.
          key={`${editing.target}:${editing.adding}`}
          initialTarget={editing.target}
          adding={editing.adding}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

/** Add or change one limit: bottom sheet on phones, dialog on desktop. */
function LimitSheet({ initialTarget, adding, onClose }: { initialTarget: string; adding: boolean; onClose: () => void }) {
  const { limits: summary, saveLimits } = useData();
  const sheetRef = useRef<HTMLDivElement>(null);
  const weeklyRef = useRef<HTMLInputElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [target, setTarget] = useState(initialTarget);
  const [weekly, setWeekly] = useState(() => limitText(limitsFor(summary, initialTarget).weekly));
  const [monthly, setMonthly] = useState(() => limitText(limitsFor(summary, initialTarget).monthly));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const existing = hasLimit(summary, target);
  const empty = !weekly.trim() && !monthly.trim();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    weeklyRef.current?.focus({ preventScroll: true });
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

  // Picking something else shows its saved amounts.
  const choose = (which: string) => {
    setTarget(which);
    const current = limitsFor(summary, which);
    setWeekly(limitText(current.weekly));
    setMonthly(limitText(current.monthly));
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const read = (text: string, label: string) => {
      if (!text.trim()) return null;
      const amount = parseAmountInput(text);
      if (amount === null || Number(amount) <= 0) throw new Error(`${label} must be a positive amount, like 5000 or 5000.50.`);
      return amount;
    };
    if (empty && !existing) return setError("Enter a weekly limit, a monthly limit, or both.");
    let body: LimitsInput;
    try {
      body = {
        category: target === ALL_SPENDING ? null : target,
        weekly_limit: read(weekly, "Weekly limit"),
        monthly_limit: read(monthly, "Monthly limit"),
      };
    } catch (err) {
      return setError((err as Error).message);
    }
    setSaving(true);
    setError(null);
    try {
      await saveLimits(body);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the limit.");
      setSaving(false);
    }
  };

  const withLimits = new Set(summary?.categories.map((c) => c.category));
  const title = adding ? "Add limit" : "Edit limit";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-title"
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id="limit-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              {title}
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

        <form onSubmit={submit} noValidate className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6">
          <label htmlFor="limit-target" className="text-[13px] font-medium text-ink-2">
            Limit for
          </label>
          <div className="relative mt-1.5 mb-4">
            <select
              id="limit-target"
              value={target}
              onChange={(e) => choose(e.target.value)}
              className="h-12 w-full appearance-none truncate rounded-2xl border border-line bg-surface pr-10 pl-4 text-[16px] font-medium text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
            >
              <option value={ALL_SPENDING}>{hasLimit(summary, ALL_SPENDING) ? "All spending · has a limit" : "All spending"}</option>
              {LIMIT_CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {withLimits.has(name) ? `${name} · has a limit` : name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-2" aria-hidden />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LimitField id="weekly-limit" label="Weekly limit" value={weekly} onChange={setWeekly} inputRef={weeklyRef} onEdit={() => setError(null)} />
            <LimitField id="monthly-limit" label="Monthly limit" value={monthly} onChange={setMonthly} onEdit={() => setError(null)} />
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            {target === ALL_SPENDING ? "Counts everything you spend." : `Counts only ${target}.`} Leave one empty for no limit on that period
            {existing ? "; leave both empty to remove this limit." : "."}
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="mt-5 h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-canvas transition active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Saving…" : empty && existing ? "Remove limit" : "Save limit"}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * One limit's meters under its name, with an Edit button. Swipe left to delete it (when
 * `onDelete` is given); `stays` keeps the block afterwards (the "All spending" meters).
 */
function LimitGroup({
  name,
  tile,
  onEdit,
  onDelete,
  stays = false,
  children,
}: {
  name: string;
  tile: ReactNode;
  onEdit: () => void;
  onDelete?: () => Promise<void>;
  stays?: boolean;
  children: ReactNode;
}) {
  return (
    <SwipeToDelete id={`limit:${name}`} onDelete={onDelete ?? (() => {})} disabled={!onDelete} removes={!stays} contentClassName="bg-surface">
      <div role="group" aria-label={`${name} limit`} className="p-4">
        <div className="flex items-center gap-3">
          {tile}
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{name}</p>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${name} limit`}
            className="h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-violet-strong hover:bg-violet-soft"
          >
            Edit
          </button>
        </div>
        <div className="mt-3 space-y-4">{children}</div>
      </div>
    </SwipeToDelete>
  );
}

/** Spent this week or month, against its limit when there is one. */
export function LimitMeter({ title, period, currency }: { title: string; period: PeriodLimit; currency: string }) {
  const range = `${shortDayLabel(period.start)} – ${shortDayLabel(period.end)}`;
  const spent = formatMoney(toMinor(period.spent), currency);
  if (period.limit === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-ink">{title}</span>
          <span className="text-xs text-ink-2">{range}</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-semibold text-ink">{spent}</span> spent · no limit
        </p>
      </div>
    );
  }
  const ratio = period.spent / period.limit;
  const color = ratio >= 1 ? "#D14429" : ratio >= 0.8 ? "#EDA100" : "#8458F5";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-ink">{title}</span>
        <span className="text-xs text-ink-2">{range}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">{spent}</span> of {formatMoney(toMinor(period.limit), currency, { decimals: false })} ·{" "}
        {formatPercent(ratio)}
        {ratio >= 1 ? " · limit reached" : ""}
        {period.alerted ? " · notified" : ""}
      </p>
      <div className="mt-2">
        <ProgressBar value={ratio} color={color} label={`${title}: ${formatPercent(ratio)} of limit`} />
      </div>
    </div>
  );
}

function LimitField({
  id,
  label,
  value,
  onChange,
  onEdit,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
          ₹
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="No limit"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onEdit();
          }}
          className="h-12 w-full rounded-2xl border border-line bg-surface pr-3 pl-8 text-[16px] font-semibold text-ink tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
        />
      </div>
    </div>
  );
}
