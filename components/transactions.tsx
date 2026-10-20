"use client";

import { CornerDownRight, CreditCard, TriangleAlert } from "lucide-react";

import { groupByDay, type Txn } from "@/lib/analytics";
import { categoryMeta, categoryName, UNCATEGORIZED } from "@/lib/categories";
import { dayHeading, formatMoney, timeLabel } from "@/lib/format";

import { useData } from "./data-provider";
import { Card, CategoryTile, IconTile, cx } from "./ui";

export function transactionTitle(t: Txn) {
  if (!t.is_parsed) return "Unrecognised SMS";
  return t.merchant || (t.category && t.category !== UNCATEGORIZED ? t.category : t.type === "DEBIT" ? "Payment" : "Money received");
}

/** "HDFC XX4821" -> "HDFC ••4821", compact enough for a phone row. */
const shortAccount = (ref: string) => ref.replace(/\b[xX*]{2,}(?=\d)/, "••");

export function TransactionRow({ t }: { t: Txn }) {
  const { openTransaction } = useData();
  const category = categoryName(t);
  const debit = t.type === "DEBIT";
  return (
    <Card className="transition hover:border-line hover:shadow-float">
      <button
        type="button"
        onClick={() => openTransaction(t.id)}
        className="flex w-full items-center gap-3.5 rounded-card p-3.5 text-left focus-visible:outline-2 focus-visible:outline-violet sm:p-4"
      >
        {t.is_parsed ? (
          <CategoryTile name={category} />
        ) : (
          <IconTile icon={TriangleAlert} color="#EDA100" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-ink">{transactionTitle(t)}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
            <CornerDownRight size={14} className="shrink-0 text-ink-3" aria-hidden />
            {t.is_parsed ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryMeta(category).color }} />
                <span className="truncate">{category}</span>
              </span>
            ) : (
              <span className="truncate font-medium text-[#9a6700]">Needs review</span>
            )}
            <span className="sr-only">, {timeLabel(t.transaction_time)}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cx(
              "block text-[16px] font-semibold tabular-nums",
              !t.is_parsed ? "text-ink-3" : debit ? "text-expense" : "text-income",
            )}
          >
            {t.is_parsed ? formatMoney(debit ? -t.minor : t.minor, t.currency, { signed: true }) : "—"}
          </span>
          {t.account_ref ? (
            <span className="mt-1 flex items-center justify-end gap-1 text-[13px] whitespace-nowrap text-ink-2">
              <CreditCard size={13} className="text-ink-3" aria-hidden />
              {shortAccount(t.account_ref)}
            </span>
          ) : null}
        </span>
      </button>
    </Card>
  );
}

/** Transactions grouped under "Monday, 12 January, 2026 · Total ₹2,95,776" headers. */
export function TransactionGroups({ items }: { items: Txn[] }) {
  const { currency, today } = useData();
  return (
    <div className="space-y-6">
      {groupByDay(items, currency).map((group) => (
        <section key={group.day} aria-label={dayHeading(group.day, today)}>
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h3 className="truncate text-[15px] text-ink-2">{dayHeading(group.day, today)}</h3>
            {group.spent > 0 ? (
              <p className="shrink-0 text-[13px] text-ink-2">
                Spent <span className="text-[15px] font-semibold text-ink tabular-nums">{formatMoney(group.spent, currency)}</span>
              </p>
            ) : null}
          </div>
          <ul className="space-y-3">
            {group.items.map((t) => (
              <li key={t.id}>
                <TransactionRow t={t} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
