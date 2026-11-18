"use client";

import { Banknote, CornerDownRight, CreditCard, NotebookPen, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { carriedForward, groupByDay, isHeldOut, type Txn } from "@/lib/analytics";
import { CASH_ACCOUNT, categoryMeta, categoryName, UNCATEGORIZED } from "@/lib/categories";
import { dayHeading, formatMoney, monthLabel, monthShortName, timeLabel } from "@/lib/format";

import { useData } from "./data-provider";
import { SwipeToDelete } from "./swipe-to-delete";
import { CategoryTile, IconTile, cx } from "./ui";

export function transactionTitle(t: Txn) {
  if (!t.is_parsed) return "Unrecognised SMS";
  return t.merchant || (t.category && t.category !== UNCATEGORIZED ? t.category : t.type === "DEBIT" ? "Payment" : "Money received");
}

/** "HDFC XX4821" -> "HDFC ••4821", compact enough for a phone row. */
const shortAccount = (ref: string) => ref.replace(/\b[xX*]{2,}(?=\d)/, "••");

/** "#goa" chips; tapping one opens Activity filtered to that tag (closing the transaction sheet). */
export function TagChips({ tags, className }: { tags: string[]; className?: string }) {
  const { requestActivity, closeTransaction } = useData();
  const router = useRouter();
  if (!tags.length) return null;
  const open = (tag: string) => {
    closeTransaction();
    requestActivity({ tag });
    router.push("/activity");
  };
  return (
    <ul className={cx("flex min-w-0 flex-wrap gap-1.5", className)} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag} className="min-w-0">
          <button
            type="button"
            onClick={() => open(tag)}
            aria-label={`Show transactions tagged ${tag}`}
            className="block h-6 max-w-full truncate rounded-full bg-violet-soft px-2 text-[12px] leading-6 font-medium text-violet-strong transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
          >
            #{tag}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A transaction in a list: tap for details, swipe left to delete (with Undo). */
export function TransactionRow({ t }: { t: Txn }) {
  const { openTransaction, deleteTransaction } = useData();
  const category = categoryName(t);
  const debit = t.type === "DEBIT";
  // A possible duplicate: greyed, with a chip saying why, and counted nowhere until you decide.
  const held = isHeldOut(t);
  return (
    <SwipeToDelete
      id={`txn:${t.id}`}
      onDelete={() => deleteTransaction(t.id)}
      className="rounded-card shadow-card transition hover:shadow-float"
      contentClassName="rounded-card border border-line/70 bg-surface transition hover:border-line"
    >
      <button
        type="button"
        onClick={() => openTransaction(t.id)}
        className="flex w-full items-center gap-3.5 rounded-card p-3.5 text-left focus-visible:outline-2 focus-visible:outline-violet sm:p-4"
      >
        {t.is_parsed ? (
          <span className={cx("shrink-0", held && "opacity-50")}>
            <CategoryTile name={category} />
          </span>
        ) : (
          <IconTile icon={TriangleAlert} color="#EDA100" />
        )}
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[16px] font-semibold", held ? "text-ink-2" : "text-ink")}>{transactionTitle(t)}</span>
          <span className="@container mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
            <CornerDownRight size={14} className="shrink-0 text-ink-3" aria-hidden />
            {held ? (
              // Only the chip: with the category beside it, it overran the amount on narrow phones.
              // It counts nowhere, so "Counts in" doesn't apply either; the sheet still shows both.
              <span className="min-w-0 truncate rounded-full bg-warn-soft px-1.5 text-[11px] leading-4 font-medium text-warn">
                Possible duplicate
              </span>
            ) : t.is_parsed ? (
              // One chip at most: "Counts in" beside a refund chip overran the amount on phones, so the
              // refund chip wins and the sheet still shows both. The category gives way first, down to
              // about "Sh…": its basis is 0 and it only grows into what the chip leaves (up to its own
              // width), so the chip keeps every pixel until then; after that the chip truncates.
              // "Refund expected" is wide: when the line can't hold it beside "Sh…" (172 px, e.g. a 402 px
              // phone with an account label under the amount), the category text goes (still read out;
              // the dot and the tile carry it) so the chip shows in full.
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryMeta(category).color }} />
                <span className={cx("max-w-fit min-w-7 grow basis-0 truncate", t.refund === "expected" && "@max-[172px]:sr-only @max-[172px]:min-w-0")}>{category}</span>
                {/* Read out by the sr-only text below, after the time. */}
                {t.refund === "expected" ? (
                  <span aria-hidden className="min-w-0 truncate rounded-full bg-violet-soft px-1.5 text-[11px] leading-4 font-medium text-violet-strong">
                    Refund expected
                  </span>
                ) : t.refund === "refunded" || t.refund_for ? (
                  <span aria-hidden className="min-w-0 truncate rounded-full bg-income-soft px-1.5 text-[11px] leading-4 font-medium text-income">
                    Refunded
                  </span>
                ) : carriedForward(t) ? (
                  <span
                    title={`Counts toward ${monthLabel(t.countsIn)}`}
                    className="min-w-0 truncate rounded-full bg-income-soft px-1.5 text-[11px] leading-4 font-medium text-income"
                  >
                    Counts in {monthShortName(t.countsIn)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="truncate font-medium text-warn">Needs review</span>
            )}
            <span className="sr-only">, {timeLabel(t.transaction_time)}</span>
            {held ? <span className="sr-only">, possible duplicate, not counted</span> : null}
            {!held && t.is_parsed && t.refund === "expected" ? <span className="sr-only">, refund expected</span> : null}
            {!held && t.is_parsed && t.refund !== "expected" && (t.refund === "refunded" || t.refund_for) ? (
              <span className="sr-only">, refunded</span>
            ) : null}
          </span>
          {t.notes ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
              <NotebookPen size={13} className="shrink-0 text-ink-3" aria-hidden />
              <span className="sr-only">Note: </span>
              <span className="truncate">{t.notes}</span>
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cx(
              "block text-[16px] font-semibold tabular-nums",
              !t.is_parsed || held ? "text-ink-3" : debit ? "text-expense" : "text-income",
            )}
          >
            {t.is_parsed ? formatMoney(debit ? -t.minor : t.minor, t.currency, { signed: true }) : "—"}
          </span>
          {t.account_ref ? (
            <span className="mt-1 flex items-center justify-end gap-1 text-[13px] whitespace-nowrap text-ink-2">
              {t.account_ref === CASH_ACCOUNT ? (
                <Banknote size={13} className="text-ink-3" aria-hidden />
              ) : (
                <CreditCard size={13} className="text-ink-3" aria-hidden />
              )}
              {shortAccount(t.account_ref)}
            </span>
          ) : null}
        </span>
      </button>
      {/* Beside the row's button, never inside it (no nested buttons); lined up with the title. */}
      <TagChips tags={t.tags} className="-mt-1.5 pr-3.5 pb-3.5 pl-[76px] sm:pr-4 sm:pb-4 sm:pl-[78px]" />
    </SwipeToDelete>
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
