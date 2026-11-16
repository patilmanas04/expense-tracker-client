"use client";

import { ChevronRight, Gauge, Landmark, LogOut, Mail, RefreshCw, Share, SquarePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { dateTimeLabel, formatMoney, longDayLabel, parseAmountInput, toMinor } from "@/lib/format";

import { FolioMark } from "../brand";
import { POLL_INTERVAL_MS, useData } from "../data-provider";
import { useTheme, type Theme } from "../theme";
import { Amount, Avatar, Card, IconTile, Segmented, SelectPill } from "../ui";
import { LIMITS_PAGE, LimitMeter, limitCount } from "./limits";

export function SettingsView() {
  const { user, txns, currency, setCurrency, currencies, refresh, refreshing, signOut } = useData();
  const [signingOut, setSigningOut] = useState(false);

  // Home links to /settings#balance; routes stay mounted, so this runs each time Settings is shown.
  useEffect(() => {
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);
  const review = txns.filter((t) => !t.is_parsed).length;
  const oldest = txns[txns.length - 1];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-safe sm:px-6 lg:px-8 lg:pt-8">
      <h1 className="pt-2 text-[22px] font-semibold tracking-tight text-ink lg:text-3xl">Settings</h1>

      {user ? (
        <Card className="mt-5 flex items-center gap-4 p-5">
          <Avatar name={user.name || user.email} picture={user.picture} className="size-14 ring-0" />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold text-ink">{user.name || "Owner"}</p>
            <p className="truncate text-sm text-ink-2">{user.email}</p>
          </div>
        </Card>
      ) : null}

      <BalanceSection />

      <LimitsSection />

      <EmailAlertsSection />

      <Group title="Data">
        <Row label="Transactions" value={String(txns.length)} />
        <Row label="Tracking since" value={oldest ? longDayLabel(oldest.day) : "—"} />
        <Row label="Needs review" value={String(review)} />
        <Row label="Updates" value={`Live · every ${POLL_INTERVAL_MS / 1000}s`}>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-full bg-violet-soft px-3.5 text-sm font-medium text-violet-strong disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} /> {refreshing ? "Syncing" : "Sync"}
          </button>
        </Row>
        {currencies.length > 1 ? (
          <Row label="Currency" value="">
            <SelectPill label="Currency" value={currency} onChange={setCurrency} options={currencies.map((c) => ({ value: c, label: c }))} />
          </Row>
        ) : null}
      </Group>

      <AppearanceSection />

      <Group title="Use Folio like an app">
        <div className="flex gap-4 p-4">
          <FolioMark className="size-12 shrink-0" />
          <ol className="space-y-1.5 text-[14px] text-ink-2">
            <li className="flex items-center gap-1.5">
              1. In Safari, tap <Share size={15} className="text-ink" aria-label="Share" />
            </li>
            <li className="flex items-center gap-1.5">
              2. Choose <SquarePlus size={15} className="text-ink" aria-hidden /> <span className="font-medium text-ink">Add to Home Screen</span>
            </li>
            <li>3. Open Folio from your home screen, full screen</li>
          </ol>
        </div>
      </Group>

      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await signOut();
        }}
        className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-full border border-expense/20 bg-surface py-3.5 text-[15px] font-semibold text-expense shadow-card hover:bg-expense-soft disabled:opacity-60"
      >
        <LogOut size={18} /> Sign out
      </button>
      <p className="mt-4 text-center text-xs text-ink-2">Folio · private expense dashboard</p>
    </div>
  );
}

/** Bank balance the running "Balance left" starts from. */
function BalanceSection() {
  const { balance, saveBalance, clearBalance } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const showForm = editing || !balance;

  const startEditing = () => {
    setDraft(balance ? balance.current.toFixed(2) : "");
    setError(null);
    setEditing(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmountInput(draft);
    if (amount === null) {
      setError("Enter an amount like 125000 or 125000.50");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveBalance(amount);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your balance.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    try {
      await clearBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove your balance.");
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <section id="balance" className="mt-6 scroll-mt-6">
      <h2 className="mb-2 px-1 text-[15px] text-ink-2">Bank balance</h2>
      <Card className="overflow-hidden">
        {showForm ? (
          <form onSubmit={submit} className="p-4" noValidate>
            <label htmlFor="balance-amount" className="text-[15px] font-medium text-ink">
              How much is in your bank account right now?
            </label>
            <div className="relative mt-3">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-semibold text-ink-2" aria-hidden>
                ₹
              </span>
              <input
                id="balance-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="1,25,000"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby="balance-help"
                className="h-13 w-full rounded-2xl border border-line bg-canvas py-3 pr-4 pl-9 text-lg font-semibold text-ink tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
              />
            </div>
            <p id="balance-help" className="mt-2 text-[13px] leading-relaxed text-ink-2">
              From now on, every debit SMS is subtracted and every credit added. Credit-card spends count when you pay the card bill.
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-canvas disabled:opacity-60">
                {busy ? "Saving…" : "Save balance"}
              </button>
              {balance ? (
                <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-full px-4 text-[15px] font-medium text-ink-2 hover:text-ink">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : balance ? (
          <div className="divide-y divide-line">
            <div className="flex items-center gap-3.5 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-soft text-violet">
                <Landmark size={22} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink-2">Balance left</p>
                <Amount
                  minor={toMinor(balance.current)}
                  currency={balance.currency}
                  sign={balance.current < 0 ? "−" : ""}
                  className={`block truncate text-2xl font-bold tracking-tight ${balance.current < 0 ? "text-expense" : "text-ink"}`}
                  fractionClassName="text-ink-2"
                />
              </div>
            </div>
            <Row label="Starting balance" value={formatMoney(toMinor(balance.opening_balance), balance.currency)} />
            <Row label="Set on" value={dateTimeLabel(balance.as_of)} />
            <Row
              label="Since then"
              value={`−${formatMoney(toMinor(balance.spent), balance.currency, { decimals: false })} · +${formatMoney(toMinor(balance.received), balance.currency, { decimals: false })}`}
            />
            {balance.excluded_card ? (
              <p className="px-4 py-3 text-[13px] text-ink-2">
                {balance.excluded_card} credit-card {balance.excluded_card === 1 ? "transaction" : "transactions"} not deducted. They count when
                the card bill is paid from your account.
              </p>
            ) : null}
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={startEditing} className="h-10 rounded-full bg-violet-soft px-4 text-sm font-semibold text-violet-strong">
                Update balance
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="h-10 rounded-full px-4 text-sm font-medium text-expense hover:bg-expense-soft disabled:opacity-60"
              >
                {confirmRemove ? "Tap again to remove" : "Remove"}
              </button>
            </div>
            {error ? (
              <p role="alert" className="px-4 pb-3 text-[13px] font-medium text-expense">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}

/** This week's and this month's spending, and the way into managing limits (a page of its own). */
function LimitsSection() {
  // Loaded with the rest of the app (and refreshed as SMS arrive), so it's ready on arrival.
  const { limits: summary } = useData();
  const count = limitCount(summary);
  return (
    <section id="limits" className="mt-6 scroll-mt-6">
      <h2 className="mb-2 px-1 text-[15px] text-ink-2">Spending limits</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {summary ? (
          <div className="space-y-4 p-4">
            <LimitMeter title="This week" period={summary.weekly} currency={summary.currency} />
            <LimitMeter title="This month" period={summary.monthly} currency={summary.currency} />
          </div>
        ) : (
          <div className="h-32 animate-pulse bg-canvas/60" aria-label="Loading limits" />
        )}
        <Link
          href={LIMITS_PAGE}
          className="flex min-h-16 items-center gap-3.5 px-4 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
        >
          <IconTile icon={Gauge} color="#8458F5" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">Manage spending limits</span>
            <span className="block truncate text-[13px] text-ink-2">
              {count ? `${count} ${count === 1 ? "limit" : "limits"} set` : "Weekly or monthly, overall or per category"}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      </Card>
    </section>
  );
}

/** Email alerts aren't offered in the app yet. */
function EmailAlertsSection() {
  return (
    <Group title="Email alerts">
      <div className="flex items-center gap-3.5 p-4" aria-disabled="true">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-track text-ink-3">
          <Mail size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink-2">Email me when I reach a limit</p>
          <p className="text-[13px] text-ink-3">Get limit alerts in your inbox as well as in Folio.</p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-soft px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-violet-strong">
          Coming soon
        </span>
      </div>
    </Group>
  );
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Light / dark / follow the phone. Saved on this device only. */
function AppearanceSection() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <Group title="Appearance">
      <div className="p-4">
        <Segmented label="Theme" value={theme} onChange={setTheme} options={THEME_OPTIONS} />
        <p className="mt-2.5 text-[13px] text-ink-2">
          {theme === "system" ? `Follows your phone's setting, currently ${resolved}.` : `Always ${theme}, on this device.`}
        </p>
      </div>
    </Group>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-[15px] text-ink-2">{title}</h2>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

function Row({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-[15px] text-ink">{label}</span>
      <span className="flex items-center gap-3 text-[15px] text-ink-2">
        {value}
        {children}
      </span>
    </div>
  );
}
