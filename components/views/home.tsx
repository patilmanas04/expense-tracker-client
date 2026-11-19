"use client";

import { BadgeIndianRupee, Bell, ChevronRight, PiggyBank, Search, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";

import {
  buildInsight,
  categoryBreakdown,
  compareWithPrevious,
  monthTitle,
  monthTotals,
  spendingPace,
} from "@/lib/analytics";
import { PALETTE, categoryMeta } from "@/lib/categories";
import { formatMoney, formatPercent, monthName, shortDayLabel } from "@/lib/format";

import { Donut } from "../charts/donut";
import { useData } from "../data-provider";
import { useSheetCorners } from "../home-sheet-corners";
import { PaceCard, toSegments } from "../insight-cards";
import { TransactionGroups } from "../transactions";
import { Amount, Avatar, Card, IconButton, IconTile, InfoTip, SectionHeader, SelectPill, cx } from "../ui";
import { GoalsCard } from "../goals-card";
import { UpcomingCard } from "./upcoming";

const RECENT_LIMIT = 8;

export function HomeView() {
  const { txns, month, setMonth, months, currency, today, cal, user, requestActivity, inbox, openNotifications } = useData();
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  useSheetCorners(sheetRef);

  const totals = useMemo(() => monthTotals(txns, month, currency), [txns, month, currency]);
  const comparison = useMemo(() => compareWithPrevious(txns, month, currency, today, cal), [txns, month, currency, today, cal]);
  const insight = useMemo(() => buildInsight(txns, month, currency, today, cal), [txns, month, currency, today, cal]);
  const categories = useMemo(
    () => categoryBreakdown(txns, month, currency, "DEBIT", today, cal),
    [txns, month, currency, today, cal],
  );
  const pace = useMemo(() => spendingPace(txns, month, currency, today, cal), [txns, month, currency, today, cal]);
  const monthTxns = useMemo(() => txns.filter((t) => t.period === month), [txns, month]);

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
  const incomeInfo = cal.payday
    ? `Money that came into your accounts in ${monthName(month)} (${shortDayLabel(cal.first(month))} – ${
        month === cal.current ? "today" : shortDayLabel(cal.last(month))
      }): salary, refunds, cashback, transfers from other people and other income. Card bill payments, transfers between your own accounts and money back from investments aren't counted. A month starts on the day your salary arrives. SMS Folio couldn't read aren't counted.`
    : `Money that came into your accounts in ${monthName(month)}: refunds, cashback, transfers from other people and other income. Card bill payments, transfers between your own accounts and money back from investments aren't counted. Salary paid on the 16th or later counts toward the next month, the one it pays for. SMS Folio couldn't read aren't counted.`;

  return (
    <div className="mx-auto max-w-6xl lg:px-8 lg:pt-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div>
          {/* Violet header, pinned on phones while the content sheet scrolls up over it */}
          <section className="hero-bg sticky top-0 z-0 overflow-hidden px-5 pt-safe pb-16 text-white sm:px-8 lg:relative lg:z-auto lg:rounded-[32px] lg:pt-6 lg:pb-10">
            <div className="flex items-center justify-between gap-3 pt-1">
              <Link href="/settings" aria-label="Settings" className="shrink-0 rounded-full">
                <Avatar name={user?.name || user?.email || "Folio"} picture={user?.picture} />
              </Link>
              <SelectPill
                variant="glass"
                label="Month"
                value={month}
                onChange={setMonth}
                options={months.map((m) => ({ value: m, label: monthTitle(cal, m) }))}
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
          </section>

          {/* Content sheet that overlaps the header on phones and slides up over it as the page
              scrolls; its top corners square off as it reaches the top (see home-sheet-corners.ts) */}
          <div
            ref={sheetRef}
            className="home-sheet relative z-10 -mt-9 rounded-t-[var(--home-radius,32px)] bg-canvas px-4 pt-6 sm:px-6 lg:z-auto lg:mt-6 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0"
          >
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
                info={incomeInfo}
              />
              <MoneyCard
                icon={Wallet}
                color="#F04438"
                label="Net flow"
                minor={totals.net}
                currency={currency}
                info={`Income minus spending and investments for ${monthName(month)}. Positive means more came in than went out; negative means more went out than came in.`}
              />
              {totals.invested > 0 ? (
                <MoneyCard
                  className="col-span-2"
                  icon={PiggyBank}
                  color={PALETTE.teal}
                  label="Invested"
                  minor={totals.invested}
                  currency={currency}
                  info={`Money put into investments and deposits in ${monthName(month)}: SIPs, mutual funds, FDs, PPF. It isn't counted in Spent, and money coming back from investments isn't counted as Income.`}
                />
              ) : null}
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

            <UpcomingCard />

            <GoalsCard className="mt-8" />

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

function MoneyCard({
  icon,
  color,
  label,
  minor,
  currency,
  info,
  className,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  minor: number;
  currency: string;
  info: string;
  className?: string;
}) {
  return (
    // relative: the (i) bubble is placed against the card so it never runs off-screen
    <Card className={cx("relative p-4 sm:p-5", className)}>
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
