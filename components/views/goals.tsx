"use client";

import { ChevronDown, Plus, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";

import { monthLabel, parseAmountInput, shiftMonth, toMinor } from "@/lib/format";
import {
  GOAL_ERRORS,
  GOAL_NAME_MAX,
  TARGET_MONTHS_AHEAD,
  decimalText,
  defaultTag,
  goalInput,
  goalNameError,
  goalProgress,
  normaliseTag,
  tagError,
} from "@/lib/goals";
import { ledgerMoney as money } from "@/lib/ledger";
import { cameFromApp } from "@/lib/nav-history";
import { TAG_MAX } from "@/lib/tags";
import type { Goal } from "@/lib/types";

import { BackBar, BottomSheet, FAB, SHEET_BUTTON, SHEET_FIELD, SheetLabel } from "../bottom-sheet";
import { useData } from "../data-provider";
import { GoalProgress } from "../goals-card";
import { Card, IconTile, Segmented, cx } from "../ui";

/** What a sheet is open for: a new goal, editing one, or adding money to one. */
type Open = { kind: "new" } | { kind: "edit"; id: string } | { kind: "money"; id: string };

/**
 * Settings → Goals: active goals (tap to edit, Add money), archived ones (Unarchive, Delete), and + for a new one.
 * Progress is money added by hand plus payments whose note has the goal's tag.
 */
export function GoalsView() {
  const { goals, goalsFailed, refreshGoals, txns, cal, saveGoal, removeGoal } = useData();
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  const active = goals?.filter((g) => !g.archived) ?? [];
  const archived = goals?.filter((g) => g.archived) ?? [];
  const sheetGoal = open && open.kind !== "new" ? (goals?.find((g) => g.id === open.id) ?? null) : null;

  const run = async (id: string, work: () => Promise<unknown>, fallback: string) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(null);
    }
  };

  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    await refreshGoals();
    setRetrying(false);
  };

  const unarchive = (goal: Goal) => run(goal.id, () => saveGoal(goalInput(goal, { archived: false }), goal.id), "Couldn't unarchive that goal.");
  const remove = (goal: Goal) => {
    if (confirming !== goal.id) return setConfirming(goal.id);
    void run(goal.id, () => removeGoal(goal.id), "Couldn't delete that goal.");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-8 lg:pb-12">
      <BackBar onBack={back} />

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Goals</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Save toward something with a tag: payments with #tag in their note count toward the goal, plus money you add
        here. Tagging never changes what counts as spending.
      </p>

      {goals === null ? (
        goalsFailed ? (
          <Card className="mt-5 p-5 text-center">
            <p className="text-[15px] text-ink">Couldn&apos;t load goals.</p>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="mt-3 h-10 rounded-full bg-violet-soft px-4 text-sm font-medium text-violet-strong hover:bg-violet/15 disabled:opacity-50"
            >
              Try again
            </button>
          </Card>
        ) : (
          <div className="mt-5 h-40 animate-pulse rounded-card bg-surface" aria-label="Loading goals" />
        )
      ) : (
        <>
          {active.length ? (
            <Card className="mt-5 divide-y divide-line overflow-hidden">
              {active.map((goal) => (
                <div key={goal.id} className="min-w-0 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: "edit", id: goal.id })}
                      aria-label={`Edit ${goal.name}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-violet"
                    >
                      <IconTile icon={Target} color="#8458F5" size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{goal.name}</span>
                        <span className="block truncate text-[13px] text-ink-2">#{goal.tag}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: "money", id: goal.id })}
                      aria-label={`Add money to ${goal.name}`}
                      className="h-8 shrink-0 rounded-full bg-violet-soft px-3 text-[13px] font-medium text-violet-strong hover:bg-violet/15"
                    >
                      Add money
                    </button>
                  </div>
                  <GoalProgress goal={goal} txns={txns} current={cal.current} />
                </div>
              ))}
            </Card>
          ) : (
            <div className="mt-5 rounded-card border border-dashed border-line px-4 py-6 text-center">
              <p className="text-[15px] font-medium text-ink">No goals yet</p>
              <p className="mt-1 text-[13px] text-ink-2">Tap + to save toward something, like a new phone or a trip.</p>
            </div>
          )}

          {archived.length ? (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Archived</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {archived.map((goal) => {
                  const progress = goalProgress(goal, txns);
                  return (
                    <div key={goal.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-4">
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-[15px] font-medium text-ink">{goal.name}</p>
                        <p className="truncate text-[13px] text-ink-2 tabular-nums">
                          {money(progress.minor)} of {money(toMinor(goal.target))} · #{goal.tag}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void unarchive(goal)}
                          disabled={busy !== null}
                          aria-label={`${busy === goal.id && confirming !== goal.id ? "Saving" : "Unarchive"} ${goal.name}`}
                          className="h-8 rounded-full px-3 text-[13px] font-medium text-violet-strong hover:bg-violet-soft disabled:opacity-50"
                        >
                          {busy === goal.id && confirming !== goal.id ? "Saving…" : "Unarchive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(goal)}
                          onBlur={() => setConfirming((current) => (current === goal.id && busy !== goal.id ? null : current))}
                          disabled={busy !== null}
                          aria-label={`${confirming === goal.id ? (busy === goal.id ? "Deleting" : "Tap again to delete") : "Delete"} ${goal.name}`}
                          className={cx(
                            "h-8 rounded-full px-3 text-[13px] font-medium transition disabled:opacity-50",
                            confirming === goal.id ? "bg-expense text-white" : "text-expense hover:bg-expense-soft",
                          )}
                        >
                          {confirming === goal.id ? (busy === goal.id ? "Deleting…" : "Tap again to delete") : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
        </>
      )}

      <button type="button" onClick={() => setOpen({ kind: "new" })} aria-label="Add goal" title="Add goal" className={FAB}>
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {open?.kind === "new" ? <GoalSheet key="new" goal={null} onClose={close} /> : null}
      {open?.kind === "edit" && sheetGoal ? <GoalSheet key={sheetGoal.id} goal={sheetGoal} onClose={close} /> : null}
      {open?.kind === "money" && sheetGoal ? <MoneySheet key={sheetGoal.id} goal={sheetGoal} onClose={close} /> : null}
    </div>
  );
}

/** Add or edit a goal: name, target, target month, tag (from the name until typed), live progress. */
function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { txns, cal, saveGoal, removeGoal } = useData();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? decimalText(toMinor(goal.target)) : "");
  const [month, setMonth] = useState(goal?.target_month ?? "");
  const [tagText, setTagText] = useState<string | null>(goal ? goal.tag : null); // null: follows the name
  const [busy, setBusy] = useState<"save" | "archive" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tag = normaliseTag(tagText ?? defaultTag(name));
  // Only the tagged payments: money added by hand isn't "from payments" (the progress bar adds both).
  const tagged = useMemo(() => goalProgress({ tag, manual_saved: 0 }, txns), [tag, txns]);

  // "No target month", this month … 60 months ahead, and a saved month that's already past.
  const current = cal.current;
  const months = useMemo(() => {
    const list = Array.from({ length: TARGET_MONTHS_AHEAD + 1 }, (_, i) => shiftMonth(current, i));
    return goal?.target_month && !list.includes(goal.target_month) ? [goal.target_month, ...list] : list;
  }, [current, goal]);

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setError(null);
    };

  // Same checks and texts as the server.
  const read = () => {
    const cleanName = name.trim();
    const nameProblem = goalNameError(cleanName);
    if (nameProblem) return nameProblem;
    const amount = parseAmountInput(target);
    if (amount === null || toMinor(Number(amount)) <= 0) return GOAL_ERRORS.target;
    const tagProblem = tagError(tag);
    if (tagProblem) return tagProblem;
    return {
      name: cleanName,
      target: amount,
      target_month: month || null,
      tag,
      manual_saved: goal ? decimalText(toMinor(goal.manual_saved)) : "0",
      archived: goal?.archived ?? false,
    };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = read();
    if (typeof input === "string") return setError(input);
    setBusy("save");
    setError(null);
    try {
      await saveGoal(input, goal?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the goal.");
      setBusy(null);
    }
  };

  const toggleArchive = async () => {
    if (!goal) return;
    setBusy("archive");
    setError(null);
    try {
      await saveGoal(goalInput(goal, { archived: !goal.archived }), goal.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the goal.");
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!goal) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    setError(null);
    try {
      await removeGoal(goal.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the goal.");
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      id="goal"
      title={goal ? "Edit goal" : "New goal"}
      onClose={onClose}
      initialFocus={nameRef}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <button type="submit" form="goal-form" disabled={busy !== null} className={SHEET_BUTTON}>
            {busy === "save" ? "Saving…" : "Save goal"}
          </button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <SheetLabel htmlFor="goal-name">Name</SheetLabel>
          <input
            ref={nameRef}
            id="goal-name"
            autoComplete="off"
            autoCapitalize="sentences"
            maxLength={GOAL_NAME_MAX + 20}
            placeholder="New phone"
            value={name}
            onChange={(e) => edit(setName)(e.target.value)}
            className={SHEET_FIELD}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <SheetLabel htmlFor="goal-target">Target</SheetLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
                ₹
              </span>
              <input
                id="goal-target"
                inputMode="decimal"
                autoComplete="off"
                placeholder="60000"
                value={target}
                onChange={(e) => edit(setTarget)(e.target.value)}
                className={cx(SHEET_FIELD, "pl-8 font-semibold tabular-nums")}
              />
            </div>
          </div>
          <div className="min-w-0">
            <SheetLabel htmlFor="goal-month">Target month</SheetLabel>
            <div className="relative">
              <select
                id="goal-month"
                value={month}
                onChange={(e) => edit(setMonth)(e.target.value)}
                className={cx(SHEET_FIELD, "appearance-none truncate pr-9 pl-3")}
              >
                <option value="">No target month</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-2" aria-hidden />
            </div>
          </div>
        </div>
        <div>
          <SheetLabel htmlFor="goal-tag">Tag</SheetLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
              #
            </span>
            <input
              id="goal-tag"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={TAG_MAX + 2}
              placeholder="phone"
              value={tagText ?? defaultTag(name)}
              onChange={(e) => edit(setTagText)(e.target.value)}
              className={cx(SHEET_FIELD, "pl-8")}
            />
          </div>
          <p aria-live="polite" className="mt-2 text-[13px] text-ink-2">
            {tag && !tagError(tag)
              ? `${money(tagged.minor)} so far from ${tagged.count} ${tagged.count === 1 ? "payment" : "payments"} tagged #${tag}`
              : "Add #tag to a payment's note to count it here."}
          </p>
        </div>
        <p className="rounded-2xl bg-track px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          Moving money to your own savings account? Set that payment&apos;s category to Self Transfer so it isn&apos;t
          counted as spending; the tag still counts it here.
        </p>
        {goal ? (
          <div className="flex flex-wrap gap-2 pb-1">
            <button
              type="button"
              onClick={() => void toggleArchive()}
              disabled={busy !== null}
              className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition active:scale-95 disabled:opacity-50"
            >
              {busy === "archive" ? "Saving…" : goal.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              onBlur={() => setConfirmDelete((current) => current && busy === "delete")}
              disabled={busy !== null}
              className={cx(
                "h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 disabled:opacity-50",
                confirmDelete ? "bg-expense text-white" : "text-expense hover:bg-expense-soft",
              )}
            >
              {busy === "delete" ? "Deleting…" : confirmDelete ? "Tap again to delete" : "Delete goal"}
            </button>
          </div>
        ) : null}
      </form>
    </BottomSheet>
  );
}

/** Add money to a goal, or take some out (never below ₹0 added by hand). */
function MoneySheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { saveGoal } = useData();
  const amountRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"add" | "take">("add");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = toMinor(goal.manual_saved);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmountInput(amount);
    const minor = value === null ? 0 : toMinor(Number(value));
    if (minor <= 0) return setError("Enter an amount above zero.");
    const next = saved + (mode === "add" ? minor : -minor);
    if (next < 0) return setError(`You can take out up to ${money(saved)}.`);
    setSaving(true);
    setError(null);
    try {
      await saveGoal(goalInput(goal, { manual_saved: decimalText(next) }), goal.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      id="goal-money"
      title={goal.name}
      onClose={onClose}
      initialFocus={amountRef}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <button type="submit" form="goal-money-form" disabled={saving} className={SHEET_BUTTON}>
            {saving ? "Saving…" : mode === "add" ? "Add money" : "Take out"}
          </button>
        </>
      }
    >
      <form id="goal-money-form" onSubmit={submit} noValidate className="space-y-4">
        <Segmented
          label="Add or take out"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setError(null);
          }}
          options={[
            { value: "add", label: "Add" },
            { value: "take", label: "Take out" },
          ]}
        />
        <div>
          <SheetLabel htmlFor="goal-money-amount">Amount</SheetLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
              ₹
            </span>
            <input
              ref={amountRef}
              id="goal-money-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className={cx(SHEET_FIELD, "pl-8 font-semibold tabular-nums")}
            />
          </div>
        </div>
        <p className="text-[13px] text-ink-2">
          Added by hand so far: <span className="font-semibold text-ink tabular-nums">{money(saved)}</span>. Tagged
          payments count on their own.
        </p>
      </form>
    </BottomSheet>
  );
}
