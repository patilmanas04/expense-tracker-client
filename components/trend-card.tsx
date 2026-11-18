"use client";

import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import {
  categoryBreakdown,
  monthlyTrend,
  trendCategories,
  trendMerchants,
  trendStats,
  type MonthCalendar,
  type Txn,
} from "@/lib/analytics";
import { PALETTE, categoryName } from "@/lib/categories";
import { formatMoney, formatPercent, monthShortName, shiftMonth } from "@/lib/format";

import { TrendBars } from "./charts/bars";
import { Card, IconTile, Segmented, SelectPill } from "./ui";

/**
 * Report → Spending trend: one category's (or one merchant's) spending month by month, ending on Report's
 * month, with the average over complete months and, for the month in progress, how it's going so far.
 * Spending only, under Expenses and Income alike. Nothing shows when the window has no counted spending.
 */
export function TrendCard({
  txns,
  month,
  currency,
  today,
  cal,
}: {
  txns: Txn[];
  month: string;
  currency: string;
  today: string;
  cal: MonthCalendar;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null); // a merchant key
  const [span, setSpan] = useState<"6" | "12">("6");
  const ready = !!today && !!month;
  const n = Number(span);
  const from = ready ? shiftMonth(month, -(n - 1)) : "";

  const categories = useMemo(() => (ready ? trendCategories(txns, from, month, currency) : []), [ready, txns, from, month, currency]);
  const monthTop = useMemo(
    () => (ready ? categoryBreakdown(txns, month, currency, "DEBIT", today, cal)[0]?.name : undefined),
    [ready, txns, month, currency, today, cal],
  );
  // A pick that isn't an option any more (another month or window) falls back to the default.
  const has = (name: string | null | undefined) => !!name && categories.some((c) => c.name === name);
  const category = has(picked) ? picked! : has(monthTop) ? monthTop! : (categories[0]?.name ?? "");
  const categoryRows = useMemo(() => txns.filter((t) => categoryName(t) === category), [txns, category]);
  const merchants = useMemo(
    () => (ready && category ? trendMerchants(categoryRows, from, month, currency) : []),
    [ready, category, categoryRows, from, month, currency],
  );
  const activeMerchant = merchants.find((m) => m.key === merchant) ?? null;
  const rows = useMemo(
    () => (activeMerchant ? txns.filter((t) => t.merchant?.trim().toLowerCase() === activeMerchant.key) : categoryRows),
    [activeMerchant, txns, categoryRows],
  );
  const stats = useMemo(() => {
    if (!ready || !category) return null;
    const points = monthlyTrend(rows, month, currency, n);
    return trendStats(points, rows, currency, today, cal);
  }, [ready, category, rows, month, currency, n, today, cal]);
  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.name, label: c.name })),
    [categories],
  );

  if (!ready || !categories.length || !stats) return null;
  const label = activeMerchant?.name ?? category;
  const money = (minor: number) => <b className="font-semibold tabular-nums text-ink">{formatMoney(minor, currency, { decimals: false })}</b>;
  const { average, highest, current } = stats;
  const sign = current?.change ? (current.change > 0 ? "+" : "−") : "";

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <IconTile icon={TrendingUp} color={PALETTE.violet} size="sm" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Spending trend</h2>
          <p className="mt-0.5 text-sm break-words text-ink-2">
            {label}, last {n} months
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <SelectPill
          size="sm"
          label="Category"
          className="max-w-full"
          value={category}
          options={categoryOptions}
          onChange={(v) => {
            setPicked(v);
            setMerchant(null);
          }}
        />
        {merchants.length ? (
          <SelectPill
            size="sm"
            label="Merchant"
            className="max-w-full"
            value={activeMerchant?.key ?? ""}
            options={[{ value: "", label: `All of ${category}` }, ...merchants.map((m) => ({ value: m.key, label: m.name }))]}
            onChange={(v) => setMerchant(v || null)}
          />
        ) : null}
      </div>
      <Segmented
        label="Months shown"
        className="mt-3 sm:max-w-xs"
        value={span}
        onChange={setSpan}
        options={[
          { value: "6", label: "6 months" },
          { value: "12", label: "12 months" },
        ]}
      />
      <div className="mt-5">
        {stats.shown.length ? (
          <TrendBars data={stats.shown} currency={currency} expenseOnly inProgress={current?.month ?? null} />
        ) : (
          <p className="text-sm text-ink-2">
            No spending on {label} in the last {n} months.
          </p>
        )}
      </div>
      <div className="mt-4 space-y-1 text-[14px] break-words text-ink-2">
        {average !== null ? <p>Average {money(average)} / month</p> : <p>Average shows after one full month.</p>}
        {highest ? (
          <p>
            Highest: {monthShortName(highest.month)} {money(highest.minor)}
          </p>
        ) : null}
        {current ? (
          <p>
            So far {money(current.soFar)}
            {current.usualSoFar !== null ? (
              <>
                {" · "}
                {money(current.usualSoFar)} on average by day {cal.dayIndex(today)}
              </>
            ) : null}
            {current.change !== null ? ` (${sign}${formatPercent(Math.abs(current.change))})` : null}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
