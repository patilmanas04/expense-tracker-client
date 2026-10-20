"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DayPoint, MonthPoint } from "@/lib/analytics";
import { compactMoney, formatMoney, monthLabel, shortDayLabel } from "@/lib/format";

const AXIS_TICK = { fill: "#8C8C96", fontSize: 11 };
const GRID = "#EFEFF2";

interface TooltipRow {
  name: string;
  color: string;
  value: number;
}

/** Values lead, series names follow, keyed by a short colour stroke. */
function TooltipCard({ title, rows, currency }: { title: string; rows: TooltipRow[]; currency: string }) {
  return (
    <div className="min-w-36 rounded-2xl bg-night px-3.5 py-2.5 text-white shadow-float">
      <p className="text-xs text-white/60">{title}</p>
      {rows.map((row) => (
        <p key={row.name} className="mt-1 flex items-center gap-2 text-sm">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="font-semibold tabular-nums">{formatMoney(row.value, currency)}</span>
          <span className="text-white/60">{row.name}</span>
        </p>
      ))}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; value?: unknown; color?: string; name?: unknown; payload?: unknown }[];
}

export function DailyBars({
  data,
  series,
  color,
  currency,
}: {
  data: DayPoint[];
  series: "expense" | "income";
  color: string;
  currency: string;
}) {
  const name = series === "expense" ? "spent" : "received";
  return (
    <figure aria-label={`Daily amount ${name}`}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={14} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={48}
              allowDecimals={false}
              tickFormatter={(v: number) => compactMoney(v, currency)}
            />
            <Tooltip
              cursor={{ fill: "rgb(132 88 245 / 0.07)", radius: 6 }}
              content={({ active, payload }: ChartTooltipProps) => {
                const point = payload?.[0]?.payload as DayPoint | undefined;
                if (!active || !point) return null;
                return (
                  <TooltipCard title={shortDayLabel(point.day)} currency={currency} rows={[{ name, color, value: point[series] }]} />
                );
              }}
            />
            <Bar dataKey={series} fill={color} radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={`Daily amount ${name}`}
        headers={["Day", name[0].toUpperCase() + name.slice(1)]}
        rows={data.filter((d) => d[series] > 0).map((d) => [shortDayLabel(d.day), formatMoney(d[series], currency)])}
      />
    </figure>
  );
}

export const INCOME_COLOR = "#38B6FF";
export const EXPENSE_COLOR = "#8458F5";

export function TrendBars({ data, currency }: { data: MonthPoint[]; currency: string }) {
  return (
    <figure aria-label="Income and expenses by month">
      <div className="mb-3 flex items-center gap-4 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: INCOME_COLOR }} /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: EXPENSE_COLOR }} /> Expenses
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={AXIS_TICK} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={48}
              allowDecimals={false}
              tickFormatter={(v: number) => compactMoney(v, currency)}
            />
            <Tooltip
              cursor={{ fill: "rgb(132 88 245 / 0.07)", radius: 8 }}
              content={({ active, payload }: ChartTooltipProps) => {
                const point = payload?.[0]?.payload as MonthPoint | undefined;
                if (!active || !point) return null;
                return (
                  <TooltipCard
                    title={monthLabel(point.month)}
                    currency={currency}
                    rows={[
                      { name: "income", color: INCOME_COLOR, value: point.income },
                      { name: "expenses", color: EXPENSE_COLOR, value: point.expense },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Income and expenses by month"
        headers={["Month", "Income", "Expenses"]}
        rows={data.map((d) => [monthLabel(d.month), formatMoney(d.income, currency), formatMoney(d.expense, currency)])}
      />
    </figure>
  );
}

/** Every chart has a readable table twin, so no value hides behind a hover. */
function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">View as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <table className="mt-2 w-full text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-ink-2">
            {headers.map((h, i) => (
              <th key={h} scope="col" className={i ? "py-1.5 text-right font-medium" : "py-1.5 font-medium"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td key={i} className={i ? "py-1.5 text-right tabular-nums text-ink" : "py-1.5 text-ink"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
