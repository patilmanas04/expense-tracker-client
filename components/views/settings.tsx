"use client";

import { Check, Landmark, LogOut, Mail, RefreshCw, Share, SquarePlus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { getLimits, saveLimits, sendTestEmail } from "@/lib/api";
import {
  dateTimeLabel,
  formatMoney,
  formatPercent,
  longDayLabel,
  parseAmountInput,
  shortDayLabel,
  toMinor,
} from "@/lib/format";
import type { LimitsSummary, PeriodLimit } from "@/lib/types";

import { FolioMark } from "../brand";
import { POLL_INTERVAL_MS, useData } from "../data-provider";
import { Amount, Avatar, Card, ProgressBar, SelectPill } from "../ui";

export function SettingsView() {
  const { user, txns, currency, setCurrency, currencies, refresh, refreshing, signOut } = useData();
  const [signingOut, setSigningOut] = useState(false);

  // Notifications link to /settings#limits; routes stay mounted, so this runs each time Settings is shown.
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
              <button type="submit" disabled={busy} className="h-11 rounded-full bg-night px-5 text-[15px] font-semibold text-white disabled:opacity-60">
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

const limitText = (value: number | null) => (value === null ? "" : String(value));

/** Weekly/monthly spend limits; reaching one sends an email (Gmail OAuth on the server). */
function LimitsSection() {
  const { txns } = useData();
  const [summary, setSummary] = useState<LimitsSummary | null>(null);
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useRef(false);

  // Reload whenever new transactions arrive (5-second polling) so the meters stay live.
  useEffect(() => {
    let cancelled = false;
    getLimits()
      .then((next) => {
        if (cancelled) return;
        setSummary(next);
        if (!dirty.current) {
          setWeekly(limitText(next.weekly.limit));
          setMonthly(limitText(next.monthly.limit));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [txns]);

  const edit = (setter: (value: string) => void) => (value: string) => {
    dirty.current = true;
    setSaved(false);
    setter(value);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const read = (text: string, label: string) => {
      if (!text.trim()) return null;
      const amount = parseAmountInput(text);
      if (amount === null || Number(amount) <= 0) throw new Error(`${label} must be a positive amount, like 5000 or 5000.50.`);
      return amount;
    };
    let body: { weekly_limit: string | null; monthly_limit: string | null };
    try {
      body = { weekly_limit: read(weekly, "Weekly limit"), monthly_limit: read(monthly, "Monthly limit") };
    } catch (err) {
      setFormError((err as Error).message);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const next = await saveLimits(body);
      setSummary(next);
      dirty.current = false;
      setWeekly(limitText(next.weekly.limit));
      setMonthly(limitText(next.monthly.limit));
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save your limits.");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await sendTestEmail();
      setTestResult({ ok: true, text: `Test email sent to ${result.to}. Check your inbox.` });
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : "Couldn't send the test email." });
    } finally {
      setTesting(false);
    }
  };

  const email = summary?.email;
  return (
    <section id="limits" className="mt-6 scroll-mt-6">
      <h2 className="mb-2 px-1 text-[15px] text-ink-2">Spending limits</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {summary ? (
          <div className="space-y-5 p-4">
            <LimitMeter title="This week" period={summary.weekly} currency={summary.currency} />
            <LimitMeter title="This month" period={summary.monthly} currency={summary.currency} />
          </div>
        ) : (
          <div className="h-32 animate-pulse bg-canvas/60" aria-label="Loading limits" />
        )}

        <form onSubmit={submit} className="p-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <LimitField id="weekly-limit" label="Weekly limit" value={weekly} onChange={edit(setWeekly)} />
            <LimitField id="monthly-limit" label="Monthly limit" value={monthly} onChange={edit(setMonthly)} />
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            Leave empty for no limit. When spending reaches a limit you get one notification under the bell on Home, once per week
            (Mon–Sun) or month.
          </p>
          {formError ? (
            <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
              {formError}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={saving} className="h-11 rounded-full bg-night px-5 text-[15px] font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save limits"}
            </button>
            {saved ? (
              <span role="status" className="flex items-center gap-1 text-sm font-medium text-income">
                <Check size={16} /> Saved
              </span>
            ) : null}
          </div>
        </form>

        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${email?.configured ? "bg-violet-soft text-violet" : "bg-track text-ink-3"}`}>
              <Mail size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-[14px]">
              {email?.configured ? (
                <>
                  <p className="font-medium text-ink">Email alerts are on too</p>
                  <p className="truncate text-ink-2">Also sent to {email.to}</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-ink">Email alerts: off</p>
                  <p className="text-ink-2">Optional. Add the Gmail keys to the server .env to also get an email (backend README).</p>
                </>
              )}
              {email?.last_error ? <p className="mt-1.5 text-[13px] text-expense">Last alert failed: {email.last_error}</p> : null}
            </div>
          </div>
          {email?.configured ? (
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="mt-3 h-10 rounded-full bg-violet-soft px-4 text-sm font-semibold text-violet-strong disabled:opacity-50"
            >
              {testing ? "Sending…" : "Send test email"}
            </button>
          ) : null}
          {testResult ? (
            <p role="status" className={`mt-2 text-[13px] font-medium ${testResult.ok ? "text-income" : "text-expense"}`}>
              {testResult.text}
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function LimitMeter({ title, period, currency }: { title: string; period: PeriodLimit; currency: string }) {
  const range = `${shortDayLabel(period.start)} – ${shortDayLabel(period.end)}`;
  const spent = formatMoney(toMinor(period.spent), currency);
  if (period.limit === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium text-ink">{title}</span>
          <span className="text-xs text-ink-2">{range}</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-semibold text-ink">{spent}</span> spent · no limit
        </p>
      </div>
    );
  }
  const ratio = period.spent / period.limit;
  const color = ratio >= 1 ? "#D14429" : ratio >= 0.8 ? "#EDA100" : "#8458F5";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-ink">{title}</span>
        <span className="text-xs text-ink-2">{range}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">{spent}</span> of {formatMoney(toMinor(period.limit), currency, { decimals: false })} ·{" "}
        {formatPercent(ratio)}
        {ratio >= 1 ? " · limit reached" : ""}
        {period.alerted ? " · notified" : ""}
      </p>
      <div className="mt-2">
        <ProgressBar value={ratio} color={color} label={`${title}: ${formatPercent(ratio)} of limit`} />
      </div>
    </div>
  );
}

function LimitField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-2" aria-hidden>
          ₹
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="No limit"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full rounded-2xl border border-line bg-canvas pr-3 pl-8 text-[16px] font-semibold text-ink tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
        />
      </div>
    </div>
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
