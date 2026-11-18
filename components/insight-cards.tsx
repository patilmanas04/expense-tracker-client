"use client";

import { Gauge, Info, Repeat, Store } from "lucide-react";

import type { CategoryStat, FrequentSpend, MerchantStat, Pace, Txn } from "@/lib/analytics";
import { OTHER, PALETTE, categoryMeta, categoryName } from "@/lib/categories";
import { formatMoney, formatPercent, monthName, shortDayLabel } from "@/lib/format";
import type { TxType } from "@/lib/types";

import type { DonutSegment } from "./charts/donut";
import { Amount, Card, CategoryTile, DeltaPill, IconTile, ProgressBar, cx } from "./ui";

/** Up to five named slices; beyond that the tail folds into a hatched "Other". */
export function toSegments(categories: CategoryStat[]): DonutSegment[] {
  const named = categories.length <= 5 ? categories : categories.slice(0, 4);
  const segments: DonutSegment[] = named.map((c) => ({ name: c.name, minor: c.minor, color: categoryMeta(c.name).color }));
  const rest = categories.slice(named.length).reduce((s, c) => s + c.minor, 0);
  if (rest > 0) segments.push({ name: OTHER, minor: rest, color: PALETTE.gray, hatched: true });
  return segments;
}

/** Category card from the reference: share of total, change vs last month, share bar. */
export function CategoryCard({
  stat,
  type,
  currency,
  onSelect,
}: {
  stat: CategoryStat;
  type: TxType;
  currency: string;
  onSelect?: () => void;
}) {
  const color = categoryMeta(stat.name).color;
  return (
    <Card className="transition hover:shadow-float">
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-card p-4 text-left focus-visible:outline-2 focus-visible:outline-violet"
        aria-label={`${stat.name}: ${formatMoney(stat.minor, currency)}, ${formatPercent(stat.share)} of total. Show transactions`}
      >
        <span className="flex items-start gap-3.5">
          <CategoryTile name={stat.name} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[16px] font-semibold text-ink">{stat.name}</span>
              <span className="shrink-0 text-[16px] font-semibold tabular-nums text-ink">{formatMoney(stat.minor, currency)}</span>
            </span>
            <span className="mt-1.5 flex items-center justify-between gap-3 text-[14px] text-ink-2">
              <span className="truncate">{formatPercent(stat.share)} of total</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <DeltaPill change={stat.change} upIsGood={type === "CREDIT"} />
                <span className="hidden min-[380px]:inline">vs last month</span>
              </span>
            </span>
          </span>
        </span>
        <span className="mt-4 block">
          <ProgressBar value={stat.share} color={color} label={`${stat.name} share of total`} />
        </span>
      </button>
    </Card>
  );
}

const OVER = "#D14429"; // reference coral, deepened for white text contrast
const UNDER = "#15803D";

/**
 * Goal-card layout from the reference, used for month-to-date pace: solid = spent,
 * hatched = projected by month end, track = last month's total.
 */
export function PaceCard({ pace, currency }: { pace: Pace; currency: string }) {
  const over = pace.projected > pace.lastMonthTotal;
  const color = over ? OVER : UNDER;
  const spentPct = Math.min(1, pace.spent / pace.lastMonthTotal) * 100;
  const projectedPct = Math.min(1, pace.projected / pace.lastMonthTotal) * 100;
  const left = pace.lastMonthTotal - pace.spent;
  const change = Math.abs(pace.projected - pace.lastMonthTotal) / pace.lastMonthTotal;
  const previous = monthName(pace.previousMonth);
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-3.5">
          <IconTile icon={Gauge} color={over ? "#FF6F4F" : PALETTE.green} />
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-ink">Spending pace</h3>
            <p className="text-sm text-ink-2">
              Day {pace.day} of {pace.days} · vs {previous}
            </p>
          </div>
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
          <Amount minor={pace.spent} currency={currency} className="text-[28px] font-bold tracking-tight text-ink" fractionClassName="text-ink-2" />
          <span className="text-[15px] text-ink-2">
            out of <span className="font-semibold">{formatMoney(pace.lastMonthTotal, currency, { decimals: false })}</span>
          </span>
        </p>
        <div
          className="relative mt-5 h-3 rounded-full"
          style={{ backgroundColor: `${color}1F` }}
          role="img"
          aria-label={`Spent ${formatPercent(spentPct / 100)} of last month's total; projected ${formatPercent(pace.projected / pace.lastMonthTotal)}`}
        >
          <div className="hatch absolute inset-y-0 left-0 rounded-full" style={{ width: `${projectedPct}%`, color: `${color}99` }} />
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${spentPct}%`, backgroundColor: color }} />
          <span
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-card"
            style={{ left: `${spentPct}%`, backgroundColor: color }}
          />
        </div>
        <div className="mt-3 flex justify-between gap-3 text-sm">
          <span className="text-ink-2">Spent so far</span>
          <span className="font-semibold text-ink">
            {left >= 0 ? `${formatMoney(left, currency, { decimals: false })} left` : `${formatMoney(-left, currency, { decimals: false })} over`}
          </span>
        </div>
      </div>
      <p className="flex items-center gap-2.5 px-5 py-3 text-[14px] font-medium text-white" style={{ backgroundColor: color }}>
        <Info size={18} className="shrink-0" aria-hidden />
        {change < 0.02
          ? `On pace to match ${previous}'s spending.`
          : `On pace to spend ${formatPercent(change)} ${over ? "more" : "less"} than ${previous}.`}
      </p>
    </Card>
  );
}

export function MerchantList({ merchants, type, currency }: { merchants: MerchantStat[]; type: TxType; currency: string }) {
  const max = merchants[0]?.minor ?? 0;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Store} color={PALETTE.violet} size="sm" />
        <h3 className="text-[17px] font-semibold text-ink">{type === "DEBIT" ? "Top merchants" : "Top sources"}</h3>
      </div>
      {merchants.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">No named {type === "DEBIT" ? "merchants" : "senders"} this month yet.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {merchants.map((m) => (
            <li key={m.name} className="flex items-center gap-3">
              <CategoryTile name={m.category} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] font-medium text-ink">{m.name}</span>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{formatMoney(m.minor, currency)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-violet" style={{ width: `${max ? (m.minor / max) * 100 : 0}%` }} />
                  </div>
                  <span className={cx("shrink-0 text-xs text-ink-2")}>
                    {m.count} {m.count === 1 ? "payment" : "payments"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Report → Habits (INR expenses only): frequent small spends and the month's biggest payments. */
export function HabitsCard({ frequent, biggest, onOpen }: { frequent: FrequentSpend[]; biggest: Txn[]; onOpen: (id: string) => void }) {
  if (!frequent.length && !biggest.length) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Repeat} color={PALETTE.teal} size="sm" />
        <h3 className="text-[17px] font-semibold text-ink">Habits</h3>
      </div>
      {frequent.length ? (
        <>
          <p className="mt-4 text-[13px] text-ink-2">Frequent small spends</p>
          <ol className="mt-3 space-y-3.5">
            {frequent.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <CategoryTile name={f.category} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{f.name}</span>
                <span className="shrink-0 text-[14px] tabular-nums text-ink-2">
                  {f.count} times · {formatMoney(f.minor, "INR", { decimals: false })}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {biggest.length ? (
        <>
          <p className="mt-4 text-[13px] text-ink-2">Biggest payments</p>
          <ol className="mt-1.5">
            {biggest.map((t) => {
              const name = t.merchant?.trim() || categoryName(t);
              const amount = formatMoney(t.minor, "INR");
              const day = shortDayLabel(t.day);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    aria-label={`${name}, ${amount}, ${day}. Open payment`}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:outline-violet"
                  >
                    <CategoryTile name={categoryName(t)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{name}</span>
                      <span className="block text-[13px] text-ink-2">{day}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{amount}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </Card>
  );
}
