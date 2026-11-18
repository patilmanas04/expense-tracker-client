"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Merge, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createRule, deleteMerchantName, deleteRule, getMerchantNames, getRules, previewRule, updateRule } from "@/lib/api";
import { CATEGORY_NAMES, PALETTE, categoryName } from "@/lib/categories";
import { dayKey, formatMoney, parseAmountInput, shortDayLabel, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { CategoryRule, CategoryRuleInput, MerchantName, RulePreview, RuleSaved } from "@/lib/types";

import { useData } from "../data-provider";
import { lockPageScroll, useSheetDrag } from "../sheet-drag";
import { SwipeToDelete } from "../swipe-to-delete";
import { Card, CategoryTile, CheckRow, cx, IconTile, Segmented } from "../ui";

export const RULES_PAGE = "/settings/rules";

/** Longest words the server takes in a rule's "Name has" and "SMS has". */
const WORDS_MAX = 255;
/** Largest amount the server stores (Numeric(12, 2)). */
const AMOUNT_MAX = 9_999_999_999.99;

/** What Tab steps through in the sheet. */
const TABBABLE = ':is(button, input, select, textarea, a[href]):not(:disabled):not([tabindex="-1"])';

const FIELD =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15";

/** The server's wording for these checks, also made here first. */
const NO_CONDITION = "Add at least one condition.";
const BAD_AMOUNT = "Enter an amount above zero.";
const NO_CATEGORY = "Pick a category from the list.";

type Money = "ANY" | "DEBIT" | "CREDIT";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** NFC, trimmed, spaces collapsed, as the server stores words; nothing left is no condition. */
const words = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ") || null;

/**
 * One line per rule, e.g. "SMS has rahul@okaxis · money out · ₹15,000 or more → Bills & Utilities".
 * Conditions in a fixed order (name, SMS, direction, amount), then the category.
 */
export function ruleSummary(rule: CategoryRuleInput): string {
  const parts: string[] = [];
  if (rule.merchant_words) parts.push(`Name has ${rule.merchant_words}`);
  if (rule.sms_words) parts.push(`SMS has ${rule.sms_words}`);
  if (rule.direction) parts.push(rule.direction === "DEBIT" ? "money out" : "money in");
  if (rule.min_amount !== null) {
    const minor = toMinor(Number(rule.min_amount));
    parts.push(`${formatMoney(minor, "INR", { decimals: minor % 100 !== 0 })} or more`);
  }
  return `${parts.join(" · ")} → ${rule.category}`;
}

/**
 * Settings → Names and rules. A page of its own, like Spending limits: merged names (made from a
 * payment's Edit) and category rules (+ to add, tap to edit). Swipe left to delete either; without
 * swiping, a merged name has its own delete button (shown on keyboard focus) and a rule's sheet has
 * "Delete rule".
 */
export function RulesView() {
  const { refresh } = useData();
  const router = useRouter();
  const [names, setNames] = useState<MerchantName[] | null>(null);
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // Retry loads again
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The sheet: the rule being edited (null = a new one); `opened` gives each opening a fresh form.
  const [editing, setEditing] = useState<{ rule: CategoryRule | null; opened: number } | null>(null);
  // Stable, so the sheet's focus effect doesn't re-run (and steal focus).
  const closeSheet = useCallback(() => setEditing(null), []);
  // Where focus goes once a deleted row (and the control on it) is gone.
  const namesHeadingRef = useRef<HTMLHeadingElement>(null);
  const rulesHeadingRef = useRef<HTMLHeadingElement>(null);

  // Routes stay mounted; this runs again (and loads again) each time the page is shown.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getMerchantNames(), getRules()]).then(
      ([nextNames, nextRules]) => {
        if (cancelled) return;
        setNames(nextNames);
        setRules(nextRules);
        setLoadError(null);
      },
      (err) => {
        if (!cancelled) setLoadError((err instanceof Error && err.message) || "Couldn't load your names and rules.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Back where you came from in the app; opened directly (a link, a reload), back to Settings.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  const open = (rule: CategoryRule | null) => {
    setNotice(null);
    setEditing((current) => ({ rule, opened: (current?.opened ?? 0) + 1 }));
  };

  // Not optimistic: the row goes once the server agrees; a failure brings it back with the reason.
  const remove = async (run: () => Promise<void>, fallback: string) => {
    setError(null);
    setNotice(null);
    try {
      await run();
    } catch (err) {
      setError((err instanceof Error && err.message) || fallback);
      throw err; // the row comes back
    }
  };
  const removeName = (id: string) =>
    remove(async () => {
      await deleteMerchantName(id);
      setNames((current) => current?.filter((n) => n.id !== id) ?? current);
    }, "Couldn't delete that merged name.");
  const removeRule = (id: string) =>
    remove(async () => {
      await deleteRule(id);
      setRules((current) => current?.filter((r) => r.id !== id) ?? current);
    }, "Couldn't delete that rule.");

  // The delete button on a merged name (keyboard, screen readers); the error shows under the lists.
  const stopRenaming = async (name: MerchantName) => {
    try {
      await removeName(name.id);
    } catch {
      return;
    }
    setNotice(`Stopped renaming ${name.from_name}.`);
    namesHeadingRef.current?.focus();
  };

  // "Delete rule" in the sheet: the sheet has already shown any error and only calls this once it's gone.
  const onDeleted = (id: string) => {
    setRules((current) => current?.filter((r) => r.id !== id) ?? current);
    setError(null);
    setNotice("Rule deleted.");
    setEditing(null);
    rulesHeadingRef.current?.focus();
  };

  const onSaved = (saved: RuleSaved, created: boolean) => {
    setRules((current) =>
      created ? [saved.rule, ...(current ?? [])] : (current ?? []).map((r) => (r.id === saved.rule.id ? saved.rule : r)),
    );
    setNotice(saved.changed > 0 ? `Rule saved. Changed ${plural(saved.changed, "past payment", "past payments")}.` : "Rule saved.");
    setEditing(null);
    // A changed category reaches every screen with a full reload (more rows than a poll can carry).
    if (saved.changed > 0) void refresh();
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

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Names and rules</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Merged names and category rules run on every new SMS and payment you add, before Folio picks a category itself.
      </p>

      {/* Always mounted, so the message is announced when it appears. */}
      <div role="status">
        {notice ? (
          <p className="mt-4 rounded-card bg-income-soft px-4 py-3 text-[13px] font-medium text-income">{notice}</p>
        ) : null}
      </div>

      {names && rules ? (
        <>
          <h2 ref={namesHeadingRef} tabIndex={-1} className="mt-6 mb-2 px-1 text-[15px] text-ink-2 outline-none">
            Merged names
          </h2>
          {names.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {names.map((n) => (
                <SwipeToDelete key={n.id} id={`name:${n.id}`} onDelete={() => removeName(n.id)} contentClassName="bg-surface">
                  <div className="flex items-center gap-3 p-4">
                    <IconTile icon={Merge} color={PALETTE.violet} size="sm" />
                    <p className="min-w-0 flex-1 text-[15px] break-words text-ink">
                      {n.from_name} → <span className="font-semibold">{n.to_name}</span>
                    </p>
                    {/* For keyboards and screen readers: hidden until focused (others swipe). The
                        size sits on the inner span, as `not-sr-only` resets the button's own. */}
                    <button
                      type="button"
                      data-swipe-action
                      onClick={() => void stopRenaming(n)}
                      aria-label={`Stop renaming ${n.from_name}`}
                      title="Delete"
                      className="sr-only shrink-0 rounded-full text-expense focus-visible:not-sr-only focus-visible:outline-2 focus-visible:outline-violet"
                    >
                      <span className="grid size-9 place-items-center">
                        <Trash2 size={17} aria-hidden />
                      </span>
                    </button>
                  </div>
                </SwipeToDelete>
              ))}
            </Card>
          ) : (
            <EmptyBox title="No merged names yet">
              To merge one, open a payment, tap Edit, change its name and tick “Also rename …”.
            </EmptyBox>
          )}

          <h2 ref={rulesHeadingRef} tabIndex={-1} className="mt-6 mb-2 px-1 text-[15px] text-ink-2 outline-none">
            Category rules
          </h2>
          {rules.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {rules.map((rule) => (
                <SwipeToDelete key={rule.id} id={`rule:${rule.id}`} onDelete={() => removeRule(rule.id)} contentClassName="bg-surface">
                  <button
                    type="button"
                    onClick={() => open(rule)}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
                  >
                    <CategoryTile name={rule.category} size="sm" />
                    <span className="min-w-0 flex-1 text-[15px] break-words text-ink">{ruleSummary(rule)}</span>
                    <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                  </button>
                </SwipeToDelete>
              ))}
            </Card>
          ) : (
            <EmptyBox title="No category rules yet">Tap + to file payments by words in the name or SMS, or by amount.</EmptyBox>
          )}

          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          {names.length || rules.length ? (
            <p className="mt-4 flex justify-center">
              <span className="rounded-full bg-track px-3 py-1.5 text-center text-[13px] text-ink-2">
                <span className="font-semibold text-ink">Tip:</span> Swipe left to delete
              </span>
            </p>
          ) : null}
        </>
      ) : loadError ? (
        <div className="mt-5 rounded-card border border-line/70 bg-surface px-4 py-5 text-center shadow-card">
          <p role="alert" className="text-[14px] font-medium text-expense">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
            className="mt-3 h-9 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6" aria-label="Loading names and rules">
          <div className="h-20 animate-pulse rounded-card bg-surface" />
          <div className="h-32 animate-pulse rounded-card bg-surface" />
        </div>
      )}

      <button
        type="button"
        onClick={() => open(null)}
        aria-label="Add category rule"
        title="Add category rule"
        className="glass-tint fixed right-5 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-30 grid size-14 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet lg:right-10 lg:bottom-10"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {editing ? (
        <RuleSheet
          key={`${editing.rule?.id ?? "new"}:${editing.opened}`}
          initial={editing.rule}
          onClose={closeSheet}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      ) : null}
    </div>
  );
}

function EmptyBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line px-4 py-6 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-ink-2">{children}</p>
    </div>
  );
}

/** The form's values checked as the server checks them: the rule to send, or the first problem. */
function readRule(form: { merchantWords: string; smsWords: string; money: Money; atLeast: string; category: string }):
  | { input: CategoryRuleInput }
  | { error: string } {
  let min_amount: string | null = null;
  if (form.atLeast.trim()) {
    min_amount = parseAmountInput(form.atLeast);
    if (min_amount === null || Number(min_amount) <= 0 || Number(min_amount) > AMOUNT_MAX) return { error: BAD_AMOUNT };
  }
  const input: CategoryRuleInput = {
    merchant_words: words(form.merchantWords),
    sms_words: words(form.smsWords),
    min_amount,
    direction: form.money === "ANY" ? null : form.money,
    category: form.category,
  };
  if (!input.merchant_words && !input.sms_words && !input.min_amount) return { error: NO_CONDITION };
  if (!CATEGORY_NAMES.includes(input.category)) return { error: NO_CATEGORY };
  return { input };
}

/**
 * Add or change one category rule: bottom sheet on phones, dialog on desktop. "Check past
 * payments" asks the server which payments it would change; the box under the answer applies it
 * to them too, and counts only while the form still holds what was checked. A saved rule's sheet
 * also has "Delete rule" (the way to delete one without swiping).
 */
function RuleSheet({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  initial: CategoryRule | null;
  onClose: () => void;
  onSaved: (saved: RuleSaved, created: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  const [merchantWords, setMerchantWords] = useState(initial?.merchant_words ?? "");
  const [smsWords, setSmsWords] = useState(initial?.sms_words ?? "");
  const [money, setMoney] = useState<Money>(initial?.direction ?? "ANY");
  const [atLeast, setAtLeast] = useState(initial?.min_amount?.replace(/\.00$/, "") ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  // The server's answer, with the form values it was about (JSON of the rule sent).
  const [preview, setPreview] = useState<{ key: string; result: RulePreview } | null>(null);
  const [applyPast, setApplyPast] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  const read = readRule({ merchantWords, smsWords, money, atLeast, category });
  // The answer counts only while the form still holds the values it was asked about.
  const shown = preview && "input" in read && preview.key === JSON.stringify(read.input) ? preview.result : null;
  const busy = checking || saving || deleting;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    firstRef.current?.focus({ preventScroll: true });
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
      // Not when it went with a deleted rule (the page then moves focus itself).
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
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

  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setError(null);
  };

  const check = async () => {
    if ("error" in read) return setError(read.error);
    const { input } = read;
    setChecking(true);
    setError(null);
    try {
      const result = await previewRule(initial ? { ...input, id: initial.id } : input);
      setPreview({ key: JSON.stringify(input), result });
      setApplyPast(false); // a fresh count is never applied without a fresh tick
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't check past payments.");
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if ("error" in read) return setError(read.error);
    const { input } = read;
    const apply = applyPast && shown !== null && shown.count > 0;
    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await updateRule(initial.id, input, apply) : await createRule(input, apply);
      onSaved(saved, initial === null);
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't save the rule.");
      setSaving(false);
    }
  };

  // Not optimistic: the sheet closes once the server agrees; a failure stays here with the reason.
  const remove = async () => {
    if (!initial || busy) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRule(initial.id);
      onDeleted(initial.id);
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't delete the rule.");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-title"
        className="animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-3 px-5 pt-3 pb-2 sm:pt-6">
            <h2 id="rule-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              {initial ? "Edit category rule" : "New category rule"}
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

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* The fields scroll; Save stays put below them. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-1">
            <Field id="rule-merchant" label="Name has">
              <input
                ref={firstRef}
                id="rule-merchant"
                autoComplete="off"
                enterKeyHint="next"
                maxLength={WORDS_MAX}
                placeholder="e.g. Swiggy Instamart"
                value={merchantWords}
                onChange={(e) => edit(setMerchantWords)(e.target.value)}
                className={FIELD}
              />
            </Field>

            <Field id="rule-sms" label="SMS has">
              <input
                id="rule-sms"
                autoComplete="off"
                autoCapitalize="off"
                enterKeyHint="next"
                maxLength={WORDS_MAX}
                placeholder="e.g. XX4821 or rahul@okaxis"
                value={smsWords}
                onChange={(e) => edit(setSmsWords)(e.target.value)}
                className={FIELD}
              />
            </Field>

            <div className="mt-4">
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">Money</p>
              <Segmented
                label="Money"
                value={money}
                onChange={edit(setMoney)}
                options={[
                  { value: "ANY", label: "Either" },
                  { value: "DEBIT", label: "Out" },
                  { value: "CREDIT", label: "In" },
                ]}
              />
            </div>

            <Field id="rule-amount" label="At least">
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
                  ₹
                </span>
                <input
                  id="rule-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="Any amount"
                  value={atLeast}
                  onChange={(e) => edit(setAtLeast)(e.target.value)}
                  className={cx(FIELD, "pl-8 tabular-nums")}
                />
              </div>
            </Field>

            <Field id="rule-category" label="Category">
              <div className="relative">
                <select
                  id="rule-category"
                  value={category}
                  onChange={(e) => edit(setCategory)(e.target.value)}
                  className={cx(FIELD, "appearance-none truncate pr-10", category ? "text-ink" : "text-ink-3")}
                >
                  {category ? null : (
                    <option value="" disabled>
                      Pick a category
                    </option>
                  )}
                  {CATEGORY_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-2" aria-hidden />
              </div>
            </Field>

            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              All conditions must match. Words match whole words in order, in any case. The newest rule that matches wins.
            </p>

            <button
              type="button"
              onClick={() => void check()}
              disabled={busy}
              className="mt-4 h-11 w-full rounded-full border border-line bg-surface text-[15px] font-medium text-ink transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60"
            >
              {checking ? "Checking…" : "Check past payments"}
            </button>

            {/* Always mounted, so the answer is announced when it arrives. */}
            <div aria-live="polite">
              {shown ? (
                <div className="mt-3">
                  <p className="text-[14px] font-medium text-ink">
                    {shown.count ? `Would change ${plural(shown.count, "past payment", "past payments")}` : "No past payments would change"}
                  </p>
                  {shown.examples.length ? (
                    <ul className="mt-2 divide-y divide-line rounded-2xl border border-line/70 bg-surface px-3.5">
                      {shown.examples.map((example) => (
                        <li key={example.id} className="flex items-center gap-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium text-ink">{example.merchant || "No name"}</span>
                            <span className="block truncate text-[12px] text-ink-2">
                              {shortDayLabel(dayKey(example.transaction_time))} · {categoryName(example)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[14px] font-medium text-ink tabular-nums">
                            {formatMoney(toMinor(Number(example.amount)), example.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {shown.count > 0 ? (
                    <CheckRow checked={applyPast} onChange={setApplyPast} disabled={saving}>
                      {shown.count === 1 ? "Also change this 1 payment" : `Also change these ${shown.count} payments`}
                    </CheckRow>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6">
            {error ? (
              <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-canvas transition active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save rule"}
            </button>
            {initial ? (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="mt-2 h-11 w-full rounded-full text-[15px] font-medium text-expense transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete rule"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}
