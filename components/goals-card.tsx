"use client";

import { ChevronRight, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Txn } from "@/lib/analytics";
import { monthName } from "@/lib/format";
import { goalInput, goalProgress, goalStatus, type GoalStatus } from "@/lib/goals";
import { ledgerMoney as money } from "@/lib/ledger";
import type { Goal } from "@/lib/types";

import { useData } from "./data-provider";
import { Card, IconTile, ProgressBar, cx } from "./ui";

export const GOALS_PAGE = "/settings/goals";

/** Goals shown on the card. */
const CARD_GOALS = 3;

const VIOLET = "#8458F5";
const GREEN = "#22B566";

/** The card shows only while there's an active goal (Report leaves out its grid cell otherwise). */
export const hasGoalsCard = (goals: Goal[] | null) => !!goals?.some((g) => !g.archived);

/**
 * "₹8,750 a month to reach it by March" (with the year from 12 months away), "Target month passed · ₹35,000 to
 * go", "Reached" or "₹35,000 to go".
 */
export function goalStatusText(goal: Goal, status: GoalStatus): string {
  switch (status.kind) {
    case "reached":
      return "Reached";
    case "passed":
      return `Target month passed · ${money(status.leftMinor)} to go`;
    case "open":
      return `${money(status.leftMinor)} to go`;
    case "plan": {
      const month = goal.target_month ?? "";
      const when = status.months >= 12 ? `${monthName(month)} ${month.slice(0, 4)}` : monthName(month);
      return `${money(status.perMonthMinor)} a month to reach it by ${when}`;
    }
  }
}

/** One goal's progress: bar, "₹25,000 of ₹60,000" and where it stands. */
export function GoalProgress({ goal, txns, current }: { goal: Goal; txns: Txn[]; current: string }) {
  const progress = goalProgress(goal, txns);
  const status = goalStatus(goal, progress.minor, current);
  const reached = status.kind === "reached";
  const target = Math.round(goal.target * 100);
  return (
    <>
      <div className="mt-2">
        <ProgressBar value={target > 0 ? progress.minor / target : 0} color={reached ? GREEN : VIOLET} label={`${goal.name}: progress`} />
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">
        <span className="font-semibold text-ink tabular-nums">{money(progress.minor)}</span> of{" "}
        <span className="tabular-nums">{money(target)}</span>
        {reached ? null : <> · {goalStatusText(goal, status)}</>}
      </p>
    </>
  );
}

/** Home and Report: up to 3 active goals, oldest first. Hidden without an active goal. */
export function GoalsCard({ className }: { className?: string }) {
  const { goals, txns, cal, saveGoal } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!hasGoalsCard(goals)) return null;
  const active = goals!.filter((g) => !g.archived).slice(0, CARD_GOALS);

  const archive = async (goal: Goal) => {
    setBusy(goal.id);
    setError(null);
    try {
      await saveGoal(goalInput(goal, { archived: true }), goal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't archive that goal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <div className="flex items-center gap-3">
        <IconTile icon={Target} color={VIOLET} size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-ink">Goals</h2>
        <Link
          href={GOALS_PAGE}
          aria-label="See all goals"
          className="flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-violet-soft pr-3 pl-4 text-sm font-medium text-violet-strong hover:bg-violet/15"
        >
          See all <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {active.map((goal) => {
          const reached = goalStatus(goal, goalProgress(goal, txns).minor, cal.current).kind === "reached";
          return (
            <li key={goal.id} className="min-w-0 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{goal.name}</p>
                {reached ? (
                  <>
                    <span className="shrink-0 rounded-full bg-income-soft px-2 py-0.5 text-[12px] font-semibold text-income">Reached</span>
                    <button
                      type="button"
                      onClick={() => void archive(goal)}
                      disabled={busy !== null}
                      className="h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-violet-strong hover:bg-violet-soft disabled:opacity-50"
                    >
                      {busy === goal.id ? "Archiving…" : "Archive"}
                    </button>
                  </>
                ) : null}
              </div>
              <GoalProgress goal={goal} txns={txns} current={cal.current} />
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
