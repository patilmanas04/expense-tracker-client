"use client";

import { ChevronDown, ChevronLeft, Plus, Store, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { leftToSpend, type LeftToSpend } from "@/lib/analytics";
import { getKnownMerchants, previewMerchant, settingError } from "@/lib/api";
import { ALL_SPENDING, PALETTE, limitCategories } from "@/lib/categories";
import { formatMoney, formatPercent, monthName, parseAmountInput, shiftMonth, shortDayLabel, toMinor } from "@/lib/format";
import { cameFromApp } from "@/lib/nav-history";
import type { KnownMerchant, LimitsSummary, MerchantLimitStatus, MerchantPreview, PeriodLimit } from "@/lib/types";

import { useData } from "../data-provider";
import { lockPageScroll, useSheetDrag } from "../sheet-drag";
import { SwipeToDelete } from "../swipe-to-delete";
import { Card, CategoryTile, cx, IconTile, ProgressBar, Segmented, SelectPill, Switch } from "../ui";

export const LIMITS_PAGE = "/settings/limits";

/** Suggestions shown: the top known merchants before typing, the top matches while typing. */
const SUGGESTIONS = 8;
/** Ask the server about a typed merchant this long after the typing stops. */
const PREVIEW_DELAY_MS = 300;
/** Longest merchant name the server takes. */
const MERCHANT_MAX = 255;
/** "Warn me at" levels: Off, or 50% to 95% in steps of 5 (server: settings_store, limits.warn_percent). */
const WARN_OPTIONS = [
  { value: "off", label: "Off" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(50 + i * 5), label: `${50 + i * 5}%` })),
];

type Kind = "category" | "merchant";

/**
 * What the sheet is open for. `target` is "All", a category or a merchant's name ("" when adding
 * a merchant); `id` is set when editing a merchant limit.
 */
type Editing = { kind: Kind; target: string; id?: string; adding: boolean };

/** Swipe-row ids and sheet keys carry the kind, so a merchant named "Shopping" or "All" can't collide. */
const limitKey = (kind: Kind, key: string) => `limit:${kind}:${key}`;

const limitText = (value: number | null) => (value === null ? "" : String(value));

/** The sheet's two amount fields, as typed. */
type Amounts = { weekly: string; monthly: string };
const NO_AMOUNTS: Amounts = { weekly: "", monthly: "" };
const amountsOf = (limit: MerchantLimitStatus): Amounts => ({ weekly: limitText(limit.weekly.limit), monthly: limitText(limit.monthly.limit) });

/** A merchant limit whose amounts the sheet loaded, and what the fields held before (back when the name moves off it). */
type Loaded = Amounts & { id: string; before: Amounts };

/** What Tab steps through in the sheet. */
const TABBABLE = ':is(button, input, select, textarea, a[href]):not(:disabled):not([tabindex="-1"])';

/** NFC, trimmed, spaces collapsed: as the server does before storing or comparing a merchant's name. */
const clean = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ");

/**
 * Whether the server takes this cleaned name for a new limit: it needs a word (a letter or digit),
 * and "Unknown" is what payments without a name are filed under, so no limit could count it.
 */
const nameable = (name: string) => /[\p{L}\p{N}]/u.test(name) && name.toLowerCase() !== "unknown";

/** The server's wording for a name with no word (also checked here first). */
const NO_NAME = "Enter a merchant name.";

/** The server's answer to saving a new merchant without a category (also checked here first). */
const PICK_CATEGORY = "Pick a category for this new merchant.";

/** A period's limit as you set it: with rollover carrying, `limit` is this month's rollover figure instead (D6). */
const baseLimit = (period: PeriodLimit | undefined) => (period ? (period.base ?? period.limit) : null);

/** The limits currently saved for "All spending" or one category (the set amounts, never the rollover figure). */
function limitsFor(summary: LimitsSummary | null, target: string) {
  if (!summary) return { weekly: null, monthly: null };
  if (target === ALL_SPENDING) return { weekly: baseLimit(summary.weekly), monthly: baseLimit(summary.monthly) };
  const rule = summary.categories.find((c) => c.category === target);
  return { weekly: baseLimit(rule?.weekly), monthly: baseLimit(rule?.monthly) };
}

/** Whether "Roll over unused amount" is on for "All spending" or one category. */
const rolloverFor = (summary: LimitsSummary | null, target: string) =>
  !summary ? false : target === ALL_SPENDING ? summary.rollover === true : summary.categories.find((c) => c.category === target)?.rollover === true;

const hasLimit = (summary: LimitsSummary | null, target: string) => {
  const { weekly, monthly } = limitsFor(summary, target);
  return weekly !== null || monthly !== null;
};

/** The limit saved for exactly this merchant name (case included), if any. */
const merchantLimit = (summary: LimitsSummary | null, name: string) =>
  name ? summary?.merchants.find((m) => m.merchant === name) : undefined;

const countsText = (counts: string[]) => `Counts: ${counts.length ? counts.join(", ") : "no payments yet"}`;

/** How many limits are set: "All spending" counts as one, plus each category and each merchant. */
export const limitCount = (summary: LimitsSummary | null) =>
  summary ? summary.categories.length + summary.merchants.length + (hasLimit(summary, ALL_SPENDING) ? 1 : 0) : 0;

/**
 * Settings → Manage spending limits. A page of its own: a back button on top, no tab bar,
 * and a + button to add a limit. Tap Edit on a limit to change it; swipe left to delete it.
 */
export function LimitsView() {
  const { limits: summary, saveLimits, saveMerchantLimit } = useData();
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stable, so the sheet's focus effect doesn't re-run (and steal focus) every time data refreshes.
  const closeSheet = useCallback(() => setEditing(null), []);

  // Back where you came from in the app; opened directly (a link, a reload), back to Settings.
  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  // + opens on the first thing without a limit: all spending, then the categories in order.
  // With every one set, there's no category left to add, so it opens on a merchant instead.
  const add = () => {
    const free = [ALL_SPENDING, ...limitCategories()].find((name) => !hasLimit(summary, name));
    setEditing(free ? { kind: "category", target: free, adding: true } : { kind: "merchant", target: "", adding: true });
  };

  // Swipe left on a limit: a category's or merchant's goes away; "All spending" keeps its meters, without limits.
  const deleteLimit = async (save: () => Promise<unknown>) => {
    setError(null);
    try {
      await save();
    } catch (err) {
      setError((err instanceof Error && err.message) || "Couldn't delete that limit.");
      throw err; // the row comes back
    }
  };
  const deleteCategoryLimit = (which: string) =>
    deleteLimit(() => saveLimits({ category: which === ALL_SPENDING ? null : which, weekly_limit: null, monthly_limit: null }));
  const deleteMerchantLimit = (id: string, merchant: string) =>
    deleteLimit(() => saveMerchantLimit({ id, merchant, weekly_limit: null, monthly_limit: null, category: null }));

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
        Reaching a limit sends one notification under the bell on Home, once per week (Mon–Sun) or month. You&apos;re
        warned once before that, at the level below.
      </p>

      <WarnLevelCard />

      {summary ? (
        <>
          <Card className="mt-5 divide-y divide-line overflow-hidden">
            <LimitGroup
              id={limitKey("category", ALL_SPENDING)}
              name="All spending"
              tile={<IconTile icon={Wallet} color="#8458F5" size="sm" />}
              onEdit={() => setEditing({ kind: "category", target: ALL_SPENDING, adding: false })}
              onDelete={hasLimit(summary, ALL_SPENDING) ? () => deleteCategoryLimit(ALL_SPENDING) : undefined}
              stays
            >
              <LimitMeter title="This week" period={summary.weekly} currency={summary.currency} />
              <LimitMeter title="This month" period={summary.monthly} currency={summary.currency} rollover={summary.rollover} />
            </LimitGroup>
          </Card>

          <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">By category</h2>
          {summary.categories.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {summary.categories.map((c) => (
                <LimitGroup
                  key={c.category}
                  id={limitKey("category", c.category)}
                  name={c.category}
                  tile={<CategoryTile name={c.category} size="sm" />}
                  onEdit={() => setEditing({ kind: "category", target: c.category, adding: false })}
                  onDelete={() => deleteCategoryLimit(c.category)}
                >
                  {c.weekly.limit !== null ? <LimitMeter title="This week" period={c.weekly} currency={summary.currency} /> : null}
                  {c.monthly.limit !== null ? (
                    <LimitMeter title="This month" period={c.monthly} currency={summary.currency} rollover={c.rollover} />
                  ) : null}
                </LimitGroup>
              ))}
            </Card>
          ) : (
            <div className="rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] font-medium text-ink">No category limits yet</p>
              <p className="mt-1 text-[13px] text-ink-2">
                Tap + to limit one category, like Food &amp; Dining or Shopping, or one merchant, like Swiggy.
              </p>
            </div>
          )}

          {summary.merchants.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">By merchant</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {summary.merchants.map((m) => (
                  <LimitGroup
                    key={m.id}
                    id={limitKey("merchant", m.id)}
                    name={m.merchant}
                    what="merchant limit"
                    tile={<IconTile icon={Store} color={PALETTE.blue} size="sm" />}
                    detail={countsText(m.counts)}
                    onEdit={() => setEditing({ kind: "merchant", target: m.merchant, id: m.id, adding: false })}
                    onDelete={() => deleteMerchantLimit(m.id, m.merchant)}
                  >
                    {m.weekly.limit !== null ? <LimitMeter title="This week" period={m.weekly} currency={summary.currency} /> : null}
                    {m.monthly.limit !== null ? <LimitMeter title="This month" period={m.monthly} currency={summary.currency} /> : null}
                  </LimitGroup>
                ))}
              </Card>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <p className="mt-4 flex justify-center">
            <span className="rounded-full bg-track px-3 py-1.5 text-center text-[13px] text-ink-2">
              <span className="font-semibold text-ink">Tip:</span> Swipe a limit left to delete it
            </span>
          </p>
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
          key={`${limitKey(editing.kind, editing.kind === "merchant" ? (editing.id ?? "") : editing.target)}:${editing.adding}`}
          initial={editing}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}

/**
 * Add or change one limit: bottom sheet on phones, dialog on desktop. Adding shows a
 * Category | Merchant switch; editing keeps the kind (and a merchant's name) fixed.
 */
function LimitSheet({ initial, onClose }: { initial: Editing; onClose: () => void }) {
  const { limits: summary, saveLimits, saveRollover, saveMerchantLimit } = useData();
  const sheetRef = useRef<HTMLDivElement>(null);
  const weeklyRef = useRef<HTMLInputElement>(null);
  const merchantRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(sheetRef, onClose);
  // Editing a merchant limit: the name can't change, only the amounts.
  const fixed = initial.kind === "merchant" && !initial.adding;
  const [mode, setMode] = useState<Kind>(initial.kind);
  const [target, setTarget] = useState(initial.kind === "category" ? initial.target : ALL_SPENDING);
  const [merchantText, setMerchantText] = useState(initial.kind === "merchant" ? initial.target : "");
  const [weekly, setWeekly] = useState(() => limitText(startingAmounts(summary, initial).weekly));
  const [monthly, setMonthly] = useState(() => limitText(startingAmounts(summary, initial).monthly));
  // The merchant limit whose amounts are in the fields (typing its name loaded them).
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const start = startingAmounts(summary, initial);
    return initial.kind === "merchant" && initial.id
      ? { id: initial.id, weekly: limitText(start.weekly), monthly: limitText(start.monthly), before: NO_AMOUNTS }
      : null;
  });
  // Merchants for the suggestions: fetched once, when the sheet first shows Merchant.
  const [known, setKnown] = useState<KnownMerchant[] | null>(null);
  const knownRequested = useRef(false);
  // The server's latest answer about the typed name; it alone decides whether the name is new.
  const [preview, setPreview] = useState<(MerchantPreview & { name: string }) | null>(null);
  const previewing = useRef({ timer: 0, request: 0 });
  const [category, setCategory] = useState("");
  // "Roll over unused amount" as switched here; null = as saved for the target.
  const [rolloverChoice, setRolloverChoice] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);

  const merchantMode = mode === "merchant";
  const name = fixed ? initial.target : clean(merchantText);
  const fixedLimit = fixed ? summary?.merchants.find((m) => m.id === initial.id) : undefined;
  // The limit being edited was deleted elsewhere (another device) while this sheet was open.
  // Not while saving: removing it from here makes it disappear too, just before the sheet closes.
  const gone = fixed && summary !== null && !fixedLimit && !saving;
  const savedMerchant = fixedLimit ?? merchantLimit(summary, name);
  const existing = merchantMode ? savedMerchant !== undefined : hasLimit(summary, target);
  const empty = !weekly.trim() && !monthly.trim();
  const savedRollover = rolloverFor(summary, target);
  const rollover = rolloverChoice ?? savedRollover;
  // Only the overall or a category's monthly limit rolls over; clearing Monthly turns it off on the server.
  const showRollover = !merchantMode && monthly.trim() !== "";
  // The server's answer counts only while it's about the name in the field now.
  const answer = preview?.name === name ? preview : null;
  // A new limit's name needs a word, as on the server; until it has one there's nothing to add or ask.
  const unnamed = merchantMode && !savedMerchant && name !== "" && !nameable(name);
  // Only a merchant the server doesn't know is asked for a category (a limit's merchant is known).
  const askCategory = merchantMode && !fixed && !savedMerchant && nameable(name) && answer?.known === false;
  // A limit's own list straight away; otherwise what the server says this name would count.
  const counts = savedMerchant ? savedMerchant.counts : answer ? answer.counts : null;
  // After Save, a missing name is said once, as the error above the button, not again here.
  const note = unnamed ? (error === NO_NAME ? "" : NO_NAME) : counts ? countsText(counts) : "";

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    // The merchant field when it's there (adding a merchant), otherwise the weekly limit.
    (merchantRef.current ?? weeklyRef.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // An open suggestion list handles Escape first (and marks it handled). Escape while an
      // IME is composing (229: Safari's key code for it) cancels the composition, not the sheet.
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229) onClose();
      if (e.key !== "Tab" || !sheetRef.current) return;
      // Moves focus itself on every Tab, not only at the ends: Safari leaves buttons out of the
      // Tab order, so from the last field it would step straight out to the page.
      e.preventDefault();
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(TABBABLE)];
      if (!focusable.length) return;
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      const step = e.shiftKey ? -1 : 1;
      // From anywhere else in the sheet (a suggestion, the sheet itself): the first or last.
      const next = at === -1 ? (e.shiftKey ? focusable.length - 1 : 0) : (at + step + focusable.length) % focusable.length;
      focusable[next].focus();
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

  // Switching to Merchant puts the cursor in its field, ready to type or pick (opening on it, too).
  useEffect(() => {
    if (mode === "merchant") merchantRef.current?.focus({ preventScroll: true });
  }, [mode]);

  const loadKnown = useCallback(() => {
    if (knownRequested.current) return;
    knownRequested.current = true;
    getKnownMerchants().then(
      (list) => setKnown(list),
      () => {
        knownRequested.current = false; // no suggestions this time; focusing the field again retries
      },
    );
  }, []);

  // Opened on a merchant to add: the suggestions are needed straight away.
  const suggestNow = initial.kind === "merchant" && !fixed;
  useEffect(() => {
    if (suggestNow) loadKnown();
  }, [suggestNow, loadKnown]);

  // A preview still waiting or in flight when the sheet closes is dropped.
  useEffect(() => {
    const pending = previewing.current;
    return () => {
      window.clearTimeout(pending.timer);
      pending.request++;
    };
  }, []);

  /** Asks the server about `merchant` once typing stops; only the newest request's answer is used. */
  const askServer = (merchant: string) => {
    const pending = previewing.current;
    window.clearTimeout(pending.timer);
    const request = ++pending.request;
    if (!nameable(merchant)) return setPreview(null);
    pending.timer = window.setTimeout(() => {
      previewMerchant(merchant).then(
        (answer) => {
          if (previewing.current.request === request) setPreview({ ...answer, name: merchant });
        },
        // No answer, so no Category select yet; saving asks the server, and its "pick a category" brings it.
        () => {},
      );
    }, PREVIEW_DELAY_MS);
  };

  /**
   * A name that already has a limit loads its amounts. Moving off it puts back what the fields
   * held before, but only while they still hold the loaded amounts: anything typed since stays.
   */
  const followLimit = (merchant: string) => {
    const limit = merchantLimit(summary, merchant);
    if ((limit?.id ?? null) === (loaded?.id ?? null)) return;
    const untouched = loaded !== null && weekly === loaded.weekly && monthly === loaded.monthly;
    const fields = loaded && untouched ? loaded.before : { weekly, monthly };
    const next = limit ? amountsOf(limit) : fields;
    setLoaded(limit ? { id: limit.id, ...next, before: fields } : null);
    setWeekly(next.weekly);
    setMonthly(next.monthly);
  };

  const typeMerchant = (text: string) => {
    setMerchantText(text);
    setError(null);
    followLimit(clean(text));
    askServer(clean(text));
  };

  const pickMerchant = (picked: string) => {
    setMerchantText(picked);
    setError(null);
    // Cleaned as typed names are, so the server's answer matches the name the sheet compares it with.
    followLimit(clean(picked));
    askServer(clean(picked));
  };

  // Category | Merchant: each shows the saved amounts of what it's on.
  const switchMode = (next: Kind) => {
    setMode(next);
    setError(null);
    if (next === "category") {
      const current = limitsFor(summary, target);
      setWeekly(limitText(current.weekly));
      setMonthly(limitText(current.monthly));
      setLoaded(null);
    } else {
      const limit = merchantLimit(summary, name);
      const amounts = limit ? amountsOf(limit) : NO_AMOUNTS;
      setWeekly(amounts.weekly);
      setMonthly(amounts.monthly);
      setLoaded(limit ? { id: limit.id, ...amounts, before: NO_AMOUNTS } : null);
      loadKnown();
    }
  };

  // Picking something else shows its saved amounts.
  const choose = (which: string) => {
    setTarget(which);
    setRolloverChoice(null);
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
    if (gone) return;
    // Same check and wording as the server's; a saved limit's name is taken as it is.
    if (merchantMode && !savedMerchant && !nameable(name)) return setError(NO_NAME);
    if (merchantMode && name.length > MERCHANT_MAX) return setError(`Merchant names can be up to ${MERCHANT_MAX} characters.`);
    if (empty && !existing) return setError("Enter a weekly limit, a monthly limit, or both.");
    let save: () => Promise<unknown>;
    try {
      const weekly_limit = read(weekly, "Weekly limit");
      const monthly_limit = read(monthly, "Monthly limit");
      if (merchantMode) {
        if (askCategory && !category) return setError(PICK_CATEGORY);
        // The id makes an edit of a limit deleted elsewhere fail ("This limit was deleted.") instead of re-creating it.
        const body = { id: savedMerchant?.id ?? null, merchant: name, weekly_limit, monthly_limit, category: askCategory ? category : null };
        save = () => saveMerchantLimit(body);
      } else {
        const scope = target === ALL_SPENDING ? null : target;
        const body = { category: scope, weekly_limit, monthly_limit };
        // The limit first, then the switch only when it changed (D9).
        const switchTo = monthly_limit !== null && rollover !== savedRollover ? rollover : null;
        save = async () => {
          await saveLimits(body);
          if (switchTo !== null) await saveRollover(scope, switchTo);
        };
      }
    } catch (err) {
      return setError((err as Error).message);
    }
    setSaving(true);
    setError(null);
    try {
      await save();
      onClose();
    } catch (err) {
      const message = (err instanceof Error && err.message) || "Couldn't save the limit.";
      if (merchantMode && message === PICK_CATEGORY) {
        // The server doesn't know this name (the preview hadn't said so, or never answered): show
        // the Category select now, keeping any counts already shown, and ask again for the real ones.
        setPreview({ name, known: false, counts: answer?.counts ?? [] });
        askServer(name);
      }
      setError(message);
      setSaving(false);
    }
  };

  const withLimits = new Set(summary?.categories.map((c) => c.category));
  const merchantsWithLimits = new Set(summary?.merchants.map((m) => m.merchant));
  const title = initial.adding ? "Add limit" : "Edit limit";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={keyboard ? { bottom: keyboard } : undefined}>
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-title"
        className={cx(
          "animate-sheet relative flex max-h-[min(92dvh,calc(100%-1rem))] w-full flex-col rounded-t-[32px] bg-canvas shadow-float sm:max-w-md sm:rounded-[32px]",
          // Merchant mode takes the full height, so the sheet doesn't jump as suggestions open and
          // close; the form scrolls inside it.
          merchantMode && "h-[min(92dvh,calc(100%-1rem))]",
        )}
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

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* The fields scroll; Save stays put below them, so it doesn't move when the suggestions close. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-1">
            {initial.adding ? (
              <Segmented
                label="Limit on"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: "category", label: "Category" },
                  { value: "merchant", label: "Merchant" },
                ]}
                className="mb-4"
              />
            ) : null}

            {!merchantMode ? (
              <>
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
                    {limitCategories().map((option) => (
                      <option key={option} value={option}>
                        {withLimits.has(option) ? `${option} · has a limit` : option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-2" aria-hidden />
                </div>
              </>
            ) : (
              <div className="mb-4">
                {fixed ? (
                  <>
                    <p className="text-[13px] font-medium text-ink-2">Merchant</p>
                    <p className="mt-1.5 flex h-12 items-center gap-2.5 rounded-2xl bg-track px-4 text-[16px] font-medium text-ink">
                      <Store size={17} className="shrink-0 text-ink-2" aria-hidden />
                      <span className="min-w-0 truncate">{name}</span>
                    </p>
                  </>
                ) : (
                  <MerchantCombobox
                    value={merchantText}
                    onType={typeMerchant}
                    onPick={pickMerchant}
                    known={known}
                    withLimits={merchantsWithLimits}
                    // The server said this exact name is new: offer to add it.
                    newName={askCategory ? name : null}
                    onAddNew={() => categoryRef.current?.focus()}
                    // A failed load of the suggestions is tried again here.
                    onFocus={loadKnown}
                    inputRef={merchantRef}
                  />
                )}
                {/* Always there, so a screen reader announces its first text as well as later ones. */}
                <p aria-live="polite" className={cx("line-clamp-2 text-[13px] text-ink-2", note && "mt-2")}>
                  {note}
                </p>
                {askCategory ? (
                  <div className="mt-4">
                    <label htmlFor="merchant-category" className="text-[13px] font-medium text-ink-2">
                      Category
                    </label>
                    <div className="relative mt-1.5">
                      <select
                        ref={categoryRef}
                        id="merchant-category"
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setError(null);
                        }}
                        className={cx(
                          "h-12 w-full appearance-none truncate rounded-2xl border border-line bg-surface pr-10 pl-4 text-[16px] font-medium outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/15",
                          category ? "text-ink" : "text-ink-3",
                        )}
                      >
                        <option value="" disabled>
                          Pick a category
                        </option>
                        {limitCategories().map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-2" aria-hidden />
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-2">New merchant: its payments will be filed under this category.</p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <LimitField id="weekly-limit" label="Weekly limit" value={weekly} onChange={setWeekly} inputRef={weeklyRef} onEdit={() => setError(null)} />
              <LimitField id="monthly-limit" label="Monthly limit" value={monthly} onChange={setMonthly} onEdit={() => setError(null)} />
            </div>
            {showRollover ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-track px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink">Roll over unused amount</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                    Next month&apos;s limit adds what you didn&apos;t spend, or takes off what you overspent (between ₹0 and
                    twice the limit). Starts next month.
                  </p>
                </div>
                <Switch
                  checked={rollover}
                  onChange={(on) => {
                    setRolloverChoice(on);
                    setError(null);
                  }}
                  label="Roll over unused amount"
                  disabled={saving}
                />
              </div>
            ) : null}
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              {merchantMode
                ? `Counts payments whose name contains ${name ? `“${name}”` : "the merchant’s name"} as whole words, with the same upper and lower case.`
                : target === ALL_SPENDING
                  ? "Counts everything you spend."
                  : `Counts only ${target}.`}{" "}
              Leave one empty for no limit on that period
              {existing ? "; leave both empty to remove this limit." : "."}
            </p>
          </div>
          <div className="shrink-0 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-6">
            {gone || error ? (
              <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
                {gone ? "This limit was deleted." : error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving || gone}
              className="h-12 w-full rounded-full bg-ink text-[16px] font-semibold text-canvas transition active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? "Saving…" : empty && existing ? "Remove limit" : "Save limit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The amounts the sheet opens with: the saved limits of what it's opened on. */
function startingAmounts(summary: LimitsSummary | null, initial: Editing) {
  if (initial.kind === "category") return limitsFor(summary, initial.target);
  const limit: MerchantLimitStatus | undefined = summary?.merchants.find((m) => m.id === initial.id);
  return { weekly: limit?.weekly.limit ?? null, monthly: limit?.monthly.limit ?? null };
}

type MerchantOption = { name: string; payments: number; adds?: boolean };

/**
 * The merchant field with its suggestions (the combobox pattern): known merchants whose name
 * contains the typed text, ignoring case, most payments first; with nothing typed, the most-paid
 * ones, shown on focus or ArrowDown so one can be picked without typing. Arrow keys move through
 * them, Enter picks one, Escape closes the list (before it closes the sheet). Focus stays in the field.
 */
function MerchantCombobox({
  value,
  onType,
  onPick,
  known,
  withLimits,
  newName,
  onAddNew,
  onFocus,
  inputRef,
}: {
  value: string;
  onType: (text: string) => void;
  onPick: (name: string) => void;
  known: KnownMerchant[] | null;
  withLimits: Set<string>;
  /** Shown as "Add … as a new merchant" at the end of the list. */
  newName: string | null;
  onAddNew: () => void;
  onFocus: () => void;
  inputRef: Ref<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = clean(value).toLowerCase();
  // Nothing typed matches every name, so the list starts as the most-paid merchants.
  const options: MerchantOption[] = known
    ? known
        .filter((k) => k.name.toLowerCase().includes(query))
        .sort((a, b) => b.payments - a.payments) // stable: the server's name order breaks ties
        .slice(0, SUGGESTIONS)
    : [];
  if (newName) options.push({ name: newName, payments: 0, adds: true });
  const shown = open && options.length > 0;
  const current = shown && active < options.length ? active : -1;

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const pick = (option: MerchantOption) => {
    close();
    if (option.adds) onAddNew();
    else onPick(option.name);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      const down = e.key === "ArrowDown";
      setOpen(true);
      if (current === -1) setActive(down ? 0 : options.length - 1);
      else setActive((current + (down ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault(); // picks the suggestion instead of saving
      pick(options[current]);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault(); // tells the sheet not to close
      close();
    }
  };

  return (
    <>
      <label htmlFor="limit-merchant" className="text-[13px] font-medium text-ink-2">
        Merchant
      </label>
      <input
        ref={inputRef}
        id="limit-merchant"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls="merchant-suggestions"
        aria-activedescendant={current >= 0 ? `merchant-option-${current}` : undefined}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={MERCHANT_MAX}
        placeholder="Type or pick a merchant"
        value={value}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          onFocus();
          setOpen(true);
        }}
        onBlur={close}
        className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
      />
      <ul
        id="merchant-suggestions"
        role="listbox"
        aria-label="Known merchants"
        hidden={!shown}
        // Tapping a suggestion mustn't take focus from the field (that would close the list first).
        onMouseDown={(e) => e.preventDefault()}
        className="mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      >
        {(shown ? options : []).map((option, i) => (
          <li
            key={`${option.adds ? "add" : "known"}:${option.name}`}
            id={`merchant-option-${i}`}
            role="option"
            aria-selected={i === current}
            tabIndex={-1}
            onClick={() => pick(option)}
            className={cx(
              "flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-[15px] text-ink",
              i === current ? "bg-violet-soft" : "hover:bg-canvas/60",
              i > 0 && "border-t border-line",
            )}
          >
            {option.adds ? (
              <>
                <Plus size={16} className="shrink-0 text-violet-strong" aria-hidden />
                <span className="min-w-0 truncate font-medium text-violet-strong">Add “{option.name}” as a new merchant</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-medium">{option.name}</span>
                <span className="shrink-0 text-[12px] text-ink-3">
                  {withLimits.has(option.name)
                    ? "has a limit"
                    : option.payments
                      ? `${option.payments} ${option.payments === 1 ? "payment" : "payments"}`
                      : "no payments yet"}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One limit's meters under its name, with an Edit button. Swipe left to delete it (when
 * `onDelete` is given); `stays` keeps the block afterwards (the "All spending" meters).
 * `id` is the swipe row's, from the caller (`limit:<kind>:<key>`).
 */
function LimitGroup({
  id,
  name,
  what = "limit",
  tile,
  detail,
  onEdit,
  onDelete,
  stays = false,
  children,
}: {
  id: string;
  name: string;
  /** Read after the name ("Swiggy merchant limit"), so a merchant named like a category gets its own name. */
  what?: string;
  tile: ReactNode;
  /** A line or two under the name (a merchant's "Counts: …"). */
  detail?: string;
  onEdit: () => void;
  onDelete?: () => Promise<void>;
  stays?: boolean;
  children: ReactNode;
}) {
  return (
    <SwipeToDelete id={id} onDelete={onDelete ?? (() => {})} disabled={!onDelete} removes={!stays} contentClassName="bg-surface">
      <div role="group" aria-label={`${name} ${what}`} className="p-4">
        <div className="flex items-center gap-3">
          {tile}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
            {detail ? <p className="line-clamp-2 text-[13px] text-ink-2">{detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${name} ${what}`}
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

/** "Warn me at": one notification when a limit is this full; saved as soon as it's picked. */
function WarnLevelCard() {
  const { settings, saveSettings } = useData();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!settings) {
    return (
      <Card className="mt-5 p-4">
        <p className="text-[13px] text-ink-2">Warnings aren&apos;t available right now. Tap Sync in Settings to try again.</p>
      </Card>
    );
  }

  const saved = settings["limits.warn_percent"];
  const shown = pending ?? (saved === null ? "off" : String(saved));

  const choose = async (value: string) => {
    setPending(value);
    setError(null);
    try {
      await saveSettings({ "limits.warn_percent": value === "off" ? null : Number(value) });
    } catch (err) {
      setError(settingError(err, "Couldn't save this setting."));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="mt-5 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-ink">Warn me at</p>
          <p className="text-[13px] text-ink-2">One notification when a limit is this full, before it&apos;s reached.</p>
        </div>
        <SelectPill
          label="Warn me at"
          size="sm"
          value={shown}
          onChange={(value) => void choose(value)}
          options={WARN_OPTIONS}
          className="shrink-0"
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/** "₹850 left · about ₹85 a day for 10 days", "₹120 over" (whole rupees; see leftToSpend). */
function paceText(pace: LeftToSpend, currency: string) {
  const money = (minor: number) => formatMoney(minor, currency, { decimals: false });
  if (pace.kind === "over") return `${money(pace.overMinor)} over`;
  if (pace.leftMinor === 0) return "Nothing left";
  const left = `${money(pace.leftMinor)} left`;
  if (pace.days === null || pace.perDayMinor === null) return left;
  if (pace.days === 1) return `${left} · today is the last day`;
  return `${left} · about ${money(pace.perDayMinor)} a day for ${pace.days} days`;
}

/** "₹5,800 limit (₹5,000 + ₹800 rolled over)", or why there's no carry; null when rollover isn't in play. */
function rolloverText(period: PeriodLimit, rollover: boolean, currentMonth: string, currency: string): string | null {
  const money = (minor: number) => formatMoney(minor, currency, { decimals: minor % 100 !== 0 });
  const carried = period.carried;
  if (typeof carried === "number" && period.limit !== null) {
    const limit = money(toMinor(period.limit));
    const base = money(toMinor(period.base ?? period.limit - carried));
    if (carried > 0) return `${limit} limit (${base} + ${money(toMinor(carried))} rolled over)`;
    if (carried < 0) return `${limit} limit (${base} − ${money(toMinor(-carried))} overspent last month)`;
    return "Nothing rolled over from last month";
  }
  if (rollover && currentMonth) return `Rolls over from ${monthName(shiftMonth(currentMonth, 1))}`;
  return null;
}

/**
 * Spent this week or month, against its limit when there is one. `rollover`: "Roll over unused amount" is on for
 * this monthly limit (shows when it starts while nothing carries yet).
 */
export function LimitMeter({
  title,
  period,
  currency,
  rollover = false,
}: {
  title: string;
  period: PeriodLimit;
  currency: string;
  rollover?: boolean;
}) {
  const { today, settings, cal } = useData();
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
  // A rollover limit can be ₹0 (last month overspent by the whole limit): reached at once.
  const ratio = period.limit > 0 ? period.spent / period.limit : 1;
  const carry = rolloverText(period, rollover, cal.current, currency);
  // Amber from the warning level (80% when warnings are Off or settings haven't loaded).
  const warnAt = (settings?.["limits.warn_percent"] ?? 80) / 100;
  const color = ratio >= 1 ? "#D14429" : ratio >= warnAt ? "#EDA100" : "#8458F5";
  const pace = leftToSpend(toMinor(period.limit), toMinor(period.spent), period.start, period.end, today);
  const over = pace.kind === "over";
  // Whole rupees, unless a rollover left paise in the limit: then the same figure as the rollover line.
  const limitMinor = toMinor(period.limit);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-ink">{title}</span>
        <span className="text-xs text-ink-2">{range}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">{spent}</span> of {formatMoney(limitMinor, currency, { decimals: limitMinor % 100 !== 0 })} ·{" "}
        {formatPercent(ratio)}
        {ratio >= 1 ? " · limit reached" : ""}
        {period.alerted ? " · notified" : ""}
      </p>
      {carry ? <p className="mt-0.5 text-[13px] text-ink-2">{carry}</p> : null}
      <div className="mt-2">
        <ProgressBar value={ratio} color={color} label={`${title}: ${formatPercent(ratio)} of limit`} />
      </div>
      <p className={cx("mt-1.5 text-[13px]", over ? "font-medium text-expense" : "text-ink-2")}>
        {paceText(pace, currency)}
      </p>
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
