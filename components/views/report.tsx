"use client";

import { ArrowLeft, ChartColumnBig, ChartPie } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { categoryBreakdown, dailySeries, monthlyTrend, spendingPace, topMerchants } from "@/lib/analytics";
import { formatMoney, monthLabel, shortDayLabel } from "@/lib/format";
import type { TxType } from "@/lib/types";

import { DailyBars, EXPENSE_COLOR, INCOME_COLOR, TrendBars } from "../charts/bars";
import { Donut } from "../charts/donut";
import { useData } from "../data-provider";
import { CategoryCard, MerchantList, PaceCard, toSegments } from "../insight-cards";
import { Card, Segmented, SelectPill, cx } from "../ui";

const CATEGORY_PREVIEW = 6;

export function ReportView() {
  const { txns, month, setMonth, months, currency, today, requestActivity } = useData();
  const router = useRouter();
  const [type, setType] = useState<TxType>("DEBIT");
  const [chart, setChart] = useState<"donut" | "bars">("donut");
  const [showAll, setShowAll] = useState(false);

  const categories = useMemo(() => categoryBreakdown(txns, month, currency, type, today), [txns, month, currency, type, today]);
  const daily = useMemo(() => dailySeries(txns, month, currency, today), [txns, month, currency, today]);
  const trend = useMemo(() => monthlyTrend(txns, month, currency), [txns, month, currency]);
  const merchants = useMemo(() => topMerchants(txns, month, currency, type), [txns, month, currency, type]);
  const pace = useMemo(() => (type === "DEBIT" ? spendingPace(txns, month, currency, today) : null), [txns, month, currency, today, type]);

  const series = type === "DEBIT" ? "expense" : "income";
  const total = categories.reduce((s, c) => s + c.minor, 0);
  const activeDays = daily.filter((d) => d[series] > 0);
  const peak = activeDays.reduce<(typeof daily)[number] | null>((best, d) => (!best || d[series] > best[series] ? d : best), null);
  const count = categories.reduce((s, c) => s + c.count, 0);
  const noun = type === "DEBIT" ? "Expenses" : "Income";
  const visibleCategories = showAll ? categories : categories.slice(0, CATEGORY_PREVIEW);

  const showCategory = (name: string) => {
    requestActivity({ category: name, kind: type, month });
    router.push("/activity");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-safe sm:px-6 lg:px-8 lg:pt-8">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Back to home" className="grid size-10 place-items-center rounded-full text-ink hover:bg-surface lg:hidden">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink lg:text-3xl">Report</h1>
        </div>
        <SelectPill label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} />
      </header>

      <Segmented
        label="Report type"
        className="mt-5 lg:max-w-md"
        value={type}
        onChange={(v) => {
          setType(v);
          setShowAll(false);
        }}
        options={[
          { value: "DEBIT", label: "Expenses" },
          { value: "CREDIT", label: "Income" },
        ]}
      />

      {/* Phones: report, categories, pace, merchants (reference order).
          Desktop: report/pace/merchants stacked left, categories right. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
        <Card className="order-1 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{noun} Report</h2>
            <div role="radiogroup" aria-label="Chart type" className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
              {(
                [
                  ["bars", ChartColumnBig, "Daily bars"],
                  ["donut", ChartPie, "Category donut"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={chart === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setChart(value)}
                  className={cx(
                    "grid size-9 place-items-center rounded-full transition",
                    chart === value ? "fab-bg text-white shadow-fab" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  <Icon size={18} strokeWidth={2.4} />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            {chart === "donut" ? (
              <Donut segments={toSegments(categories)} total={total} currency={currency} centerLabel={`Total ${noun}`} />
            ) : (
              <DailyBars data={daily} series={series} color={type === "DEBIT" ? EXPENSE_COLOR : INCOME_COLOR} currency={currency} />
            )}
          </div>

          <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl bg-canvas py-3 text-center">
            <Stat label="Daily avg" value={daily.length ? formatMoney(Math.round(total / daily.length), currency, { decimals: false }) : "—"} />
            <Stat label={peak ? `Peak · ${shortDayLabel(peak.day)}` : "Peak day"} value={peak ? formatMoney(peak[series], currency, { decimals: false }) : "—"} />
            <Stat label="Payments" value={String(count)} />
          </dl>
        </Card>

        {pace ? (
          <div className="order-3">
            <PaceCard pace={pace} currency={currency} />
          </div>
        ) : null}

        <div className="order-4">
          <MerchantList merchants={merchants} type={type} currency={currency} />
        </div>
        </div>

        <section aria-labelledby="all-categories" className="order-2 lg:order-none">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h2 id="all-categories" className="text-[15px] text-ink-2">
              All {noun}
            </h2>
            <p className="text-[13px] text-ink-2">
              Total <span className="text-[17px] font-semibold text-ink tabular-nums">{formatMoney(total, currency)}</span>
            </p>
          </div>
          {categories.length === 0 ? (
            <Card className="p-6 text-center text-[15px] text-ink-2">No {noun.toLowerCase()} recorded in {monthLabel(month)}.</Card>
          ) : (
            <ul className="space-y-3">
              {visibleCategories.map((stat) => (
                <li key={stat.name}>
                  <CategoryCard stat={stat} type={type} currency={currency} onSelect={() => showCategory(stat.name)} />
                </li>
              ))}
            </ul>
          )}
          {categories.length > CATEGORY_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 h-11 w-full rounded-full text-[15px] font-medium text-violet-strong hover:bg-violet-soft"
            >
              {showAll ? "Show fewer" : `Show all ${categories.length} categories`}
            </button>
          ) : null}
        </section>

        <Card className="order-5 p-5 sm:p-6 lg:order-none lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Cash flow</h2>
          <p className="mt-0.5 mb-4 text-sm text-ink-2">Income and expenses, last 6 months</p>
          <TrendBars data={trend} currency={currency} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2">
      <dt className="truncate text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
