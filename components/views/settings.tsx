"use client";

import { ChevronRight, Gauge, Landmark, ListChecks, LogOut, Mail, RefreshCw, Scale, Share, SquarePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { needsReview } from "@/lib/analytics";
import { settingError } from "@/lib/api";
import { dateTimeLabel, formatMoney, longDayLabel, parseAmountInput, shiftDay, toMinor, weekdayDayLabel } from "@/lib/format";
import type { Settings } from "@/lib/types";

import { FolioMark } from "../brand";
import { POLL_INTERVAL_MS, useData } from "../data-provider";
import { useTheme, type Theme } from "../theme";
import { Amount, Avatar, Card, IconTile, Segmented, SelectPill, Switch } from "../ui";
import { BALANCE_PAGE } from "./balance-breakdown";
import { LIMITS_PAGE, LimitMeter, limitCount } from "./limits";
import { RULES_PAGE } from "./rules";

export function SettingsView() {
  const { user, txns, currency, setCurrency, currencies, refresh, refreshing, signOut, requestActivity } = useData();
  const [signingOut, setSigningOut] = useState(false);

  // Home links to /settings#balance; routes stay mounted, so this runs each time Settings is shown.
  useEffect(() => {
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);
  const review = txns.filter(needsReview).length;
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

      <AlertsSection />

      <LimitsSection />

      <RulesSection />

      <EmailAlertsSection />

      <Group title="Data">
        <Row label="Transactions" value={String(txns.length)} />
        <Row label="Tracking since" value={oldest ? longDayLabel(oldest.day) : "—"} />
        {review ? (
          // Opens Activity with "Needs review" selected.
          <Link
            href="/activity"
            onClick={() => requestActivity({ kind: "REVIEW" })}
            aria-label={`Needs review: ${review}. Show in Activity`}
            className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 transition hover:bg-canvas/60 active:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
          >
            <span className="text-[15px] text-ink">Needs review</span>
            <span className="flex items-center gap-1.5 text-[15px] text-ink-2">
              {review}
              <ChevronRight size={18} className="-mr-1 shrink-0 text-ink-3" aria-hidden />
            </span>
          </Link>
        ) : (
          <Row label="Needs review" value="0" />
        )}
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

/** "Read at" is limited to this long ago (the app's choice; the server takes any past time). */
const READ_AT_MAX_MS = 7 * 86_400_000;

/** Bank balance the running "Balance left" starts from. */
function BalanceSection() {
  const { balance, saveBalance, clearBalance, today, settings, saveSettings } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // When you read the balance: "now", or a day ("YYYY-MM-DD", IST) with a time ("HH:MM").
  const [readDay, setReadDay] = useState("now");
  const [readTime, setReadTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The field the error is about, for aria-invalid; null when it's about neither (a failed save).
  const [errorField, setErrorField] = useState<"amount" | "time" | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const showForm = editing || !balance;

  const fail = (message: string, field: "amount" | "time" | null = null) => {
    setError(message);
    setErrorField(field);
  };
  const invalid = (field: "amount" | "time") => Boolean(error) && errorField === field;

  // Now, or one of the last 7 days counting today (a time on the oldest one may still be too early: submit checks).
  const readDays = useMemo(() => {
    const options = [{ value: "now", label: "Now" }];
    if (!today) return options;
    return [
      ...options,
      { value: today, label: "Today" },
      { value: shiftDay(today, -1), label: "Yesterday" },
      ...[2, 3, 4, 5, 6].map((n) => ({ value: shiftDay(today, -n), label: weekdayDayLabel(shiftDay(today, -n)) })),
    ];
  }, [today]);

  const startEditing = () => {
    setDraft(balance ? balance.current.toFixed(2) : "");
    setReadDay("now");
    setReadTime("");
    setError(null);
    setEditing(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmountInput(draft);
    if (amount === null) {
      fail("Enter an amount like 125000 or 125000.50", "amount");
      return;
    }
    // Read earlier: that moment in IST, checked here (the server only refuses future times).
    let asOf: string | undefined;
    if (readDay !== "now") {
      if (!readTime) {
        fail("Enter the time you read your balance.", "time");
        return;
      }
      asOf = `${readDay}T${readTime}:00+05:30`;
      const at = Date.parse(asOf);
      const now = Date.now();
      if (at > now) {
        fail("That time hasn't come yet.", "time");
        return;
      }
      if (now - at > READ_AT_MAX_MS) {
        fail("Pick a time in the last 7 days.", "time");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await saveBalance(amount, asOf);
      setEditing(false);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Couldn't save your balance.");
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
      fail(err instanceof Error ? err.message : "Couldn't remove your balance.");
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
              How much is in your bank accounts?
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
                aria-invalid={invalid("amount")}
                aria-describedby={invalid("amount") ? "balance-help balance-error" : "balance-help"}
                className="h-13 w-full rounded-2xl border border-line bg-canvas py-3 pr-4 pl-9 text-lg font-semibold text-ink tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[15px] text-ink">Read at</span>
              <SelectPill label="Read at" value={readDay} onChange={setReadDay} options={readDays} />
              {readDay !== "now" ? (
                <input
                  type="time"
                  aria-label="Time you read it"
                  aria-invalid={invalid("time")}
                  aria-describedby={invalid("time") ? "balance-error" : undefined}
                  value={readTime}
                  onChange={(e) => setReadTime(e.target.value)}
                  // 16px stops iOS Safari zooming in.
                  className="h-10 min-w-0 rounded-2xl border border-line bg-canvas px-3 text-base text-ink tabular-nums outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
                />
              ) : null}
            </div>
            <p id="balance-help" className="mt-2 text-[13px] leading-relaxed text-ink-2">
              HDFC and ICICI together. From the time you read it, every debit SMS is subtracted and every credit added. Credit-card
              spends count when you pay the card bill.
            </p>
            {error ? (
              <p id="balance-error" role="alert" className="mt-2 text-[13px] font-medium text-expense">
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
                <p className="text-[12px] text-ink-2">HDFC and ICICI together</p>
              </div>
            </div>
            <Row label="Starting balance" value={formatMoney(toMinor(balance.opening_balance), balance.currency)} />
            <Row label="Read at" value={dateTimeLabel(balance.as_of)} />
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
            <Link
              href={BALANCE_PAGE}
              className="flex min-h-16 items-center gap-3.5 px-4 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
            >
              <IconTile icon={Scale} color="#8458F5" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">How it&apos;s worked out</span>
                <span className="block text-[13px] text-ink-2">What was counted and what was left out</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
            </Link>
            {settings ? (
              <AmountSettingRow
                settingKey="alerts.low_balance"
                // ?? null: a server from before this setting leaves the key out.
                saved={settings["alerts.low_balance"] ?? null}
                save={saveSettings}
                label="Alert me below"
                hint="One notification when a payment takes Balance left below this amount."
                summary="Below"
                placeholder="10,000"
                max={LOW_BALANCE_MAX}
                help={LOW_BALANCE_HELP}
              />
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

const LARGE_AMOUNT_MAX = 10_000_000;
const LARGE_AMOUNT_HELP = "Enter a whole number of rupees from 1 to 1,00,00,000.";
const LOW_BALANCE_MAX = 100_000_000;
const LOW_BALANCE_HELP = "Enter a whole number of rupees from 1 to 10,00,00,000.";

/** "5,000", "₹ 5000" → 5000; null unless a whole number of rupees from 1 to max. */
function parseRupees(text: string, max: number): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const rupees = Number(cleaned);
  return rupees >= 1 && rupees <= max ? rupees : null;
}

/** Payment alerts (notifications in the bell): large payments and payments unusual for the merchant. */
function AlertsSection() {
  const { settings, saveSettings } = useData();
  return (
    <section id="alerts" className="mt-6 scroll-mt-6">
      <h2 className="mb-2 px-1 text-[15px] text-ink-2">Alerts</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {settings ? (
          <>
            <AmountSettingRow
              settingKey="alerts.large_amount"
              saved={settings["alerts.large_amount"]}
              save={saveSettings}
              label="Payments over"
              hint="Get a notification for any payment over this amount."
              summary="Over"
              placeholder="5,000"
              max={LARGE_AMOUNT_MAX}
              help={LARGE_AMOUNT_HELP}
            />
            <UnusualRow saved={settings["alerts.unusual"]} save={saveSettings} />
          </>
        ) : (
          <p className="p-4 text-[13px] text-ink-2">Alert settings aren&apos;t available right now. Tap Sync below to try again.</p>
        )}
      </Card>
    </section>
  );
}

type SaveSettings = ReturnType<typeof useData>["saveSettings"];

/** A whole-rupee setting ("Payments over ₹X", "Alert me below ₹X"): on asks for the amount first; off saves straight away. */
function AmountSettingRow({
  settingKey,
  saved,
  save,
  label,
  hint,
  summary,
  placeholder,
  max,
  help,
}: {
  settingKey: "alerts.large_amount" | "alerts.low_balance";
  saved: number | null;
  save: SaveSettings;
  label: string;
  hint: string;
  /** Before the saved amount: "Over", "Below". */
  summary: string;
  placeholder: string;
  max: number;
  help: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const errorId = useId();

  const startEditing = (value: string) => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const toggle = async (on: boolean) => {
    if (on) {
      startEditing("");
      return;
    }
    setError(null);
    if (saved === null) {
      setEditing(false); // nothing saved yet: just close the form
      return;
    }
    setBusy(true);
    try {
      await save({ [settingKey]: null } as Partial<Settings>);
      setEditing(false);
    } catch (err) {
      setError(settingError(err, "Couldn't turn this off."));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const rupees = parseRupees(draft, max);
    if (rupees === null) {
      setError(help);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save({ [settingKey]: rupees } as Partial<Settings>);
      setEditing(false);
    } catch (err) {
      setError(settingError(err, "Couldn't save the amount."));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setError(null);
    setEditing(false);
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-ink">{label}</p>
          {saved !== null && !editing ? (
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
              <span>{summary} {formatMoney(saved * 100, "INR", { decimals: false })}</span>
              <button
                type="button"
                onClick={() => startEditing(String(saved))}
                className="-my-1 rounded-full py-1 font-semibold text-violet-strong focus-visible:outline-2 focus-visible:outline-violet"
              >
                Change
              </button>
            </p>
          ) : (
            <p className="text-[13px] text-ink-2">{hint}</p>
          )}
        </div>
        <Switch label={label} checked={editing || saved !== null} onChange={(on) => void toggle(on)} disabled={busy} />
      </div>
      {editing ? (
        <form onSubmit={submit} className="mt-3" noValidate>
          <label htmlFor={inputId} className="sr-only">
            Amount in rupees
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-semibold text-ink-2" aria-hidden>
              ₹
            </span>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={placeholder}
              // Opened by the switch or "Change": the amount is what's wanted next.
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="h-13 w-full min-w-0 rounded-2xl border border-line bg-canvas py-3 pr-4 pl-9 text-lg font-semibold text-ink tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15"
            />
          </div>
          {error ? (
            <p id={errorId} role="alert" className="mt-2 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-canvas disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel} className="h-11 rounded-full px-4 text-[15px] font-medium text-ink-2 hover:text-ink">
              Cancel
            </button>
          </div>
        </form>
      ) : error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "Unusual for the merchant": saves as soon as it's flipped. */
function UnusualRow({ saved, save }: { saved: boolean; save: SaveSettings }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await save({ "alerts.unusual": on });
    } catch (err) {
      setError(settingError(err, "Couldn't save this setting."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-ink">Unusual for the merchant</p>
          <p className="text-[13px] text-ink-2">When a payment is at least 3× what you usually spend there, and ₹500 or more.</p>
        </div>
        <Switch label="Unusual for the merchant" checked={saved} onChange={(on) => void toggle(on)} disabled={busy} />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-expense">
          {error}
        </p>
      ) : null}
    </div>
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
              {count ? `${count} ${count === 1 ? "limit" : "limits"} set` : "Overall, per category or per merchant"}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      </Card>
    </section>
  );
}

/** The way into merged names and category rules (a page of its own). */
function RulesSection() {
  return (
    <section id="rules" className="mt-3 scroll-mt-6">
      <Card className="overflow-hidden">
        <Link
          href={RULES_PAGE}
          className="flex min-h-16 items-center gap-3.5 px-4 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
        >
          <IconTile icon={ListChecks} color="#8458F5" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">Names and rules</span>
            <span className="block text-[13px] text-ink-2">Merge merchant names, set categories by rule</span>
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
