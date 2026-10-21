"use client";

import { BadgeIndianRupee, Bell, ChevronRight, Landmark, Search, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  buildInsight,
  categoryBreakdown,
  compareWithPrevious,
  monthTotals,
  spendingPace,
} from "@/lib/analytics";
import { categoryMeta } from "@/lib/categories";
import { dayKey, formatMoney, formatPercent, monthLabel, monthName, shortDayLabel, toMinor } from "@/lib/format";

import { Donut } from "../charts/donut";
import { useData } from "../data-provider";
import { PaceCard, toSegments } from "../insight-cards";
import { TransactionGroups } from "../transactions";
import { Amount, Avatar, Card, IconButton, IconTile, InfoTip, SectionHeader, SelectPill, cx } from "../ui";

const RECENT_LIMIT = 8;

export function HomeView() {
  const { txns, month, setMonth, months, currency, today, user, requestActivity, inbox, openNotifications } = useData();
  const router = useRouter();

  const totals = useMemo(() => monthTotals(txns, month, currency), [txns, month, currency]);
  const comparison = useMemo(() => compareWithPrevious(txns, month, currency, today), [txns, month, currency, today]);
  const insight = useMemo(() => buildInsight(txns, month, currency, today), [txns, month, currency, today]);
  const categories = useMemo(() => categoryBreakdown(txns, month, currency, "DEBIT", today), [txns, month, currency, today]);
  const pace = useMemo(() => spendingPace(txns, month, currency, today), [txns, month, currency, today]);
  const monthTxns = useMemo(() => txns.filter((t) => t.month === month), [txns, month]);

  const openActivity = (request: Parameters<typeof requestActivity>[0]) => {
    requestActivity(request);
    router.push("/activity");
  };

  const previousName = monthName(comparison.previousMonth);
  const comparisonText = !comparison.hasPrevious
    ? "Your first month in Folio"
    : comparison.delta === 0
      ? `Same as ${comparison.isCurrent ? "this time last month" : previousName}`
      : `${formatMoney(Math.abs(comparison.delta), currency, { decimals: false })} ${comparison.delta < 0 ? "less" : "more"} than ${
          comparison.isCurrent ? "last month" : previousName
        }`;

  return (
    <div className="mx-auto max-w-6xl lg:px-8 lg:pt-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div>
          {/* Violet header */}
          <section className="hero-bg relative overflow-hidden px-5 pt-safe pb-16 text-white sm:px-8 lg:rounded-[32px] lg:pt-6 lg:pb-10">
            <div className="flex items-center justify-between gap-3 pt-1">
              <Link href="/settings" aria-label="Settings" className="shrink-0 rounded-full">
                <Avatar name={user?.name || user?.email || "Folio"} picture={user?.picture} />
              </Link>
              <SelectPill
                variant="glass"
                label="Month"
                value={month}
                onChange={setMonth}
                options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
              />
              <button
                type="button"
                onClick={openNotifications}
                aria-label={inbox.unread ? `Notifications, ${inbox.unread} new` : "Notifications"}
                aria-haspopup="dialog"
                className="glass-on-color relative grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95"
              >
                <Bell size={20} fill="currentColor" />
                {inbox.unread ? <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-[#ff3b30] ring-2 ring-(--hero-ring)" /> : null}
              </button>
            </div>

            <div className="mt-9 text-center lg:mt-10">
              <p className="text-[15px] font-medium text-white/85">
                {comparison.isCurrent ? "Spent this month" : `Spent in ${monthName(month)}`}
              </p>
              <Amount
                minor={totals.expense}
                currency={currency}
                className="mt-2 block text-[44px] leading-none font-bold tracking-tight sm:text-[56px]"
                fractionClassName="text-white/55"
              />
              <p className="mt-4 inline-flex rounded-full bg-white/20 px-3.5 py-1.5 text-[14px] font-medium backdrop-blur-md">
                {comparisonText}
              </p>
            </div>

            <BalanceLeft />
          </section>

          {/* Content sheet that overlaps the header on phones */}
          <div className="relative -mt-9 rounded-t-[32px] bg-canvas px-4 pt-6 sm:px-6 lg:mt-6 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0">
            <SectionHeader
              title="Your Money"
              action={
                <Link
                  href="/report"
                  className="flex h-9 items-center gap-1 rounded-full border border-line bg-surface pr-2.5 pl-3.5 text-sm text-ink-2 hover:text-ink"
                >
                  Details <ChevronRight size={16} />
                </Link>
              }
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MoneyCard
                icon={BadgeIndianRupee}
                color="#2196F3"
                label="Income"
                minor={totals.income}
                currency={currency}
                info={`Money that came into your accounts in ${monthName(month)}: salary, refunds, cashback and transfers in. SMS Folio couldn't read aren't counted.`}
              />
              <MoneyCard
                icon={Wallet}
                color="#F04438"
                label="Net flow"
                minor={totals.net}
                currency={currency}
                info={`Income minus expenses for ${monthName(month)}. Positive means more came in than went out; negative means you spent more than you received.`}
              />
            </div>

            {insight ? (
              <Link
                href="/report"
                className="insight-glow mt-5 flex items-center gap-3 rounded-[28px] bg-insight py-3.5 pr-4 pl-5 text-on-insight transition active:scale-[0.99]"
              >
                <Sparkles size={22} className="shrink-0 text-violet" fill="currentColor" aria-hidden />
                <span className="line-clamp-2 flex-1 text-[15px] leading-snug font-medium">{insight.text}</span>
                <span className="flex shrink-0 items-center text-[14px] text-on-insight/60">
                  Report <ChevronRight size={16} />
                </span>
              </Link>
            ) : null}

            <section className="mt-8" aria-labelledby="recent-heading">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 id="recent-heading" className="text-lg font-semibold tracking-tight text-ink">
                  Transactions
                </h2>
                <div className="flex items-center gap-2">
                  <IconButton label="Search transactions" onClick={() => openActivity({ focusSearch: true })}>
                    <Search size={17} />
                  </IconButton>
                  <Link
                    href="/activity"
                    className="flex h-10 items-center rounded-full bg-violet-soft px-4 text-sm font-medium text-violet-strong hover:bg-violet/15"
                  >
                    See all
                  </Link>
                </div>
              </div>
              {monthTxns.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="font-medium text-ink">No transactions in {monthName(month)}</p>
                  <p className="mt-1 text-sm text-ink-2">Pick another month from the top, or check your Shortcut automation.</p>
                </Card>
              ) : (
                <>
                  <TransactionGroups items={monthTxns.slice(0, RECENT_LIMIT)} />
                  {monthTxns.length > RECENT_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => openActivity({ kind: "ALL", month })}
                      className="mt-5 flex h-12 w-full items-center justify-center gap-1 rounded-full border border-line bg-surface text-[15px] font-medium text-ink shadow-card hover:shadow-float"
                    >
                      See all {monthTxns.length} transactions <ChevronRight size={17} />
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>

        {/* Desktop-only analytics column */}
        <aside className="hidden space-y-6 lg:sticky lg:top-8 lg:block">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Where it went</h2>
              <Link href="/report" className="flex items-center text-sm text-ink-2 hover:text-ink">
                Report <ChevronRight size={16} />
              </Link>
            </div>
            <div className="mt-4">
              <Donut segments={toSegments(categories)} total={totals.expense} currency={currency} centerLabel="Total Expenses" />
            </div>
            <ul className="mt-6 space-y-3">
              {categories.slice(0, 5).map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => openActivity({ category: c.name, kind: "DEBIT", month })}
                    className="flex w-full items-center gap-3 rounded-xl text-left text-[15px] hover:text-violet-strong"
                  >
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: categoryMeta(c.name).color }} />
                    <span className="flex-1 truncate text-ink">{c.name}</span>
                    <span className="text-ink-2">{formatPercent(c.share)}</span>
                    <span className="w-28 text-right font-semibold tabular-nums text-ink">{formatMoney(c.minor, currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {pace ? <PaceCard pace={pace} currency={currency} /> : null}
        </aside>
      </div>
    </div>
  );
}

/** Running bank balance under the spend figure; links to Settings to set or update it. */
function BalanceLeft() {
  const { balance } = useData();
  const card =
    "mx-auto mt-6 flex w-full max-w-sm items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 text-left ring-1 ring-white/25 backdrop-blur-md transition hover:bg-white/20";
  if (!balance) {
    return (
      <Link href="/settings#balance" className={card}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
          <Landmark size={19} aria-hidden />
        </span>
        <span className="flex-1 text-[14px] leading-snug font-medium">Set your bank balance to see what&apos;s left</span>
        <ChevronRight size={18} className="shrink-0 text-white/70" aria-hidden />
      </Link>
    );
  }
  return (
    <Link href="/settings#balance" className={card} aria-label={`Balance left ${formatMoney(toMinor(balance.current), balance.currency)}. Update in settings`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
        <Landmark size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-white/80">Balance left</span>
        <Amount
          minor={toMinor(balance.current)}
          currency={balance.currency}
          sign={balance.current < 0 ? "−" : ""}
          className="block truncate text-[22px] leading-tight font-bold tracking-tight"
          fractionClassName="text-white/60"
        />
      </span>
      <span className="shrink-0 text-right text-[12px] leading-tight text-white/75">
        since
        <br />
        {shortDayLabel(dayKey(balance.as_of))}
      </span>
    </Link>
  );
}

function MoneyCard({
  icon,
  color,
  label,
  minor,
  currency,
  info,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  minor: number;
  currency: string;
  info: string;
}) {
  return (
    // relative: the (i) bubble is placed against the card so it never runs off-screen
    <Card className="relative p-4 sm:p-5">
      <IconTile icon={icon} color={color} round size="lg" />
      <p className="mt-6 flex items-center gap-1.5 text-[15px] text-ink-2">
        {label}
        <InfoTip label={label} text={info} />
      </p>
      <p className={cx("mt-1.5 truncate text-[22px] font-bold tracking-tight tabular-nums sm:text-2xl", minor < 0 ? "text-expense" : "text-ink")}>
        {formatMoney(minor, currency)}
      </p>
    </Card>
  );
}
