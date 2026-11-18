export type TxType = "DEBIT" | "CREDIT";

/** Mirrors `TransactionResponse` in the FastAPI backend. */
export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  currency: string;
  merchant: string | null;
  category: string | null;
  account_ref: string | null;
  balance: number | null;
  reference_id: string | null;
  sender: string | null;
  raw_message: string;
  is_parsed: boolean;
  parsed_by: string;
  /** Your own note, added after the transaction arrives. */
  notes: string | null;
  transaction_time: string;
  created_at: string;
  /** Moves on every change (an edit, a category filled in later); the polling cursor. */
  updated_at: string;
  /** The earlier transaction this may be a second record of, while you haven't decided; it then counts nowhere. */
  duplicate_of: string | null;
  /** Whose figure `balance` (the SMS's "Avl Bal") is: a bank account's balance, or a credit card's limit left; null without one. */
  balance_kind: "bank" | "card" | null;
  /** A payment you expect money back for: "expected" until you confirm the refund, then "refunded"; null otherwise. */
  refund: "expected" | "refunded" | null;
  /** On a credit you confirmed as a refund: the payment it refunded. */
  refund_for: string | null;
}

/** Mirrors `ManualTransactionInput` in the backend's main.py. */
export interface NewTransaction {
  type: TxType;
  /** Plain decimal string, e.g. "249.50". */
  amount: string;
  merchant: string;
  /** null = picked from the name by the same rules as bank SMS. */
  category: string | null;
  /** ISO timestamp with offset. */
  transaction_time: string;
  /** Cash never changes the bank balance. */
  paid_with: "bank" | "cash";
}

/** Mirrors `TransactionEdit` in the backend's main.py: only the fields sent change. */
export type TransactionPatch = Partial<{
  type: TxType;
  amount: string;
  merchant: string;
  category: string;
  transaction_time: string;
  /** Only for transactions added by hand. */
  paid_with: "bank" | "cash";
  /** "" removes the note. */
  notes: string;
}>;

/** Mirrors `BalanceSummary` in the backend's balance.py. */
export interface Balance {
  opening_balance: number;
  currency: string;
  /** Transactions after this moment adjust the balance. */
  as_of: string;
  spent: number;
  received: number;
  current: number;
  counted: number;
  /** Credit-card alerts skipped (they hit the account when the bill is paid). */
  excluded_card: number;
}

/** Why a transaction since the saved balance didn't move Balance left (server: balance.SKIP_REASONS, in this order). */
export type SkipReason = "unreadable" | "other_currency" | "duplicate" | "cash" | "credit_card";

export interface SkipGroup {
  count: number;
  /** Signed decimal string ("-2350.00"): what they'd have changed if counted; null for unreadable and other currency. */
  total: string | null;
  /** Oldest first. */
  ids: string[];
}

/** Mirrors `BalanceBreakdown` in the backend's balance.py. Amounts are decimal strings. */
export interface BalanceBreakdown {
  currency: string;
  start: { amount: string; as_of: string };
  /** Oldest first; `effect` is negative for money out, `running` is Balance left after the row. */
  counted: { id: string; effect: string; running: string }[];
  skipped: Record<SkipReason, SkipGroup>;
  /** Equals Balance left. */
  current: string;
}

/** Mirrors `LimitsSummary` in the backend's limits.py. */
export interface PeriodLimit {
  limit: number | null;
  spent: number;
  /** "YYYY-MM-DD", first and last day (IST). */
  start: string;
  end: string;
  /** Notification already sent for this period and limit. */
  alerted: boolean;
}

/** A category with a spending limit of its own. */
export interface CategoryLimitStatus {
  category: string;
  weekly: PeriodLimit;
  monthly: PeriodLimit;
}

/** A merchant with a spending limit of its own (`MerchantLimitStatus` in limits.py). */
export interface MerchantLimitStatus {
  id: string;
  /** Exactly as picked or typed; identity includes case ("Swiggy" and "SWIGGY" are two limits). */
  merchant: string;
  /** Payment names this limit counts (all time), most payments first; empty before the first one. */
  counts: string[];
  weekly: PeriodLimit;
  monthly: PeriodLimit;
}

export interface LimitsSummary {
  currency: string;
  /** Overall ("All spending"). */
  weekly: PeriodLimit;
  monthly: PeriodLimit;
  /** Only categories that have a limit, in category order. */
  categories: CategoryLimitStatus[];
  /** Merchant limits, oldest first. */
  merchants: MerchantLimitStatus[];
  email: { configured: boolean; to: string | null; last_error: string | null };
}

/** Body of `PUT /api/v1/limits`: decimal strings, or null for "no limit". */
export interface LimitsInput {
  /** A category; null for overall spending. Both limits null removes a category's limit. */
  category: string | null;
  weekly_limit: string | null;
  monthly_limit: string | null;
}

/** Body of `PUT /api/v1/limits/merchants`. Both limits null removes the merchant's limit. */
export interface MerchantLimitInput {
  /** The limit being changed or removed; the server answers "This limit was deleted." if it's gone. */
  id?: string | null;
  merchant: string;
  weekly_limit: string | null;
  monthly_limit: string | null;
  /** Only for a merchant the server doesn't know yet (a spending category); ignored otherwise. */
  category: string | null;
}

/** One entry of `GET /api/v1/limits/merchants/known`: a merchant paid before, or typed in earlier. */
export interface KnownMerchant {
  name: string;
  /** 0 for a typed merchant not paid yet. */
  payments: number;
}

/** `GET /api/v1/limits/merchants/preview`: is the name known, and which payment names it would count. */
export interface MerchantPreview {
  known: boolean;
  counts: string[];
}

export interface NotificationAction {
  label: string;
  /** Same-origin POST, always under /api/v1/. */
  path: string;
}

/** Mirrors `NotificationOut` / `Inbox` in the backend's notifications.py. */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Dashboard path to open on tap, e.g. "/settings/limits"; null for notifications with buttons: tapping only marks it read. */
  link: string | null;
  created_at: string;
  read: boolean;
  /** Buttons; empty for most kinds. */
  actions: NotificationAction[];
  /** Shown in place of the buttons once decided. */
  resolved: string | null;
}

export interface Inbox {
  unread: number;
  items: AppNotification[];
}

export interface User {
  id: string;
  name: string | null;
  email: string;
  picture: string | null;
}

/** One merged name: payments named `from_name` (any case) are renamed `to_name`. Mirrors `MerchantNameOut` in the backend's rules.py. */
export interface MerchantName {
  id: string;
  /** The name as it was when merged, e.g. "SWIGGY". */
  from_name: string;
  to_name: string;
  created_at: string;
}

/** Mirrors `NameSaved` in the backend's rules.py: the merged name and how many payments were renamed. */
export interface NameSaved {
  name: MerchantName;
  /** Payments renamed, the one being edited included. */
  changed: number;
}

/** A category rule's conditions and category (all conditions must match). Mirrors `RuleFields` in the backend's rules.py. */
export interface CategoryRuleInput {
  /** Words the payment's name must have (whole words, in order, any case); null = any name. */
  merchant_words: string | null;
  /** Words the SMS must have; never matches payments added by hand. */
  sms_words: string | null;
  /** Decimal string in INR, e.g. "15000" or "15000.50"; at least this much (inclusive). */
  min_amount: string | null;
  /** null = money in or out. */
  direction: TxType | null;
  category: string;
}

/** Mirrors `CategoryRuleOut` in the backend's rules.py. */
export interface CategoryRule extends CategoryRuleInput {
  id: string;
  created_at: string;
}

/** A past payment a rule would change. Mirrors `RuleExample` in the backend's rules.py. */
export interface RuleExample {
  id: string;
  merchant: string | null;
  /** Decimal string, e.g. "18000.00". */
  amount: string;
  currency: string;
  transaction_time: string;
  /** Its category today. */
  category: string | null;
}

/** Mirrors `RulePreview` in the backend's rules.py: what applying the rule to past payments would change. */
export interface RulePreview {
  count: number;
  /** Up to 5, newest first. */
  examples: RuleExample[];
}

/** Mirrors `RuleSaved` in the backend's rules.py. */
export interface RuleSaved {
  rule: CategoryRule;
  /** Past payments changed (0 unless applied to past payments). */
  changed: number;
}

/** How often a recurring series is paid (server: recurring.CADENCES). */
export type Cadence = "weekly" | "monthly" | "yearly";

/** Mirrors `RecurringSeriesOut` in the backend's recurring.py. Amounts are decimal strings, dates "YYYY-MM-DD" (IST). */
export interface RecurringSeries {
  /** The merchant name casefolded with spaces collapsed; with `cadence`, what a decision is saved against. */
  merchant_key: string;
  /** The newest payment's merchant, spaces collapsed. */
  name: string;
  cadence: Cadence;
  /** The newest payment: the current price. */
  amount: string;
  /** The price before, set only while it differs from `amount` by more than both 5% and ₹10. */
  previous_amount: string | null;
  /** Payments in the run (within the 855-day window). */
  payments: number;
  first_date: string;
  last_date: string;
  /** `last_date` plus the median gap (whole days). */
  next_expected: string;
  /** Today is more than a quarter of a period past `next_expected`. */
  late: boolean;
  /** "cancelled": marked cancelled with no payment since; "dismissed": Not recurring (only in `hidden`). */
  status: "active" | "cancelled" | "dismissed";
}

/** Mirrors `RecurringSummary` in recurring.py: `items` = active (late first, then by next date) then cancelled; `hidden` = Not recurring. */
export interface RecurringSummary {
  currency: string;
  /** Active series only, per month at current prices, whole rupees sent with two decimals ("24067.00"). */
  monthly_total: string;
  items: RecurringSeries[];
  hidden: RecurringSeries[];
}

/** A decision on a series (server: recurring_decisions.status); clearing it is a separate call. */
export type RecurringDecision = "dismissed" | "cancelled";

/** What an upcoming item is (server: upcoming.py): a bank's auto-debit notice, a card bill, or a recurring series' next payment. */
export type UpcomingKind = "auto_debit" | "card_bill" | "expected";

/**
 * "paid": a matching payment was seen; "not_seen": none seen and the due date has gone (auto-debits: by 5 days);
 * "late": an expected payment past its date; "upcoming": otherwise.
 */
export type UpcomingStatus = "upcoming" | "paid" | "not_seen" | "late";

/** Mirrors `UpcomingItemOut` in the backend's upcoming.py. Amounts are decimal strings, `date` "YYYY-MM-DD" (IST). */
export interface UpcomingItem {
  /** The notice's id (dismiss with it); null for an item expected from a recurring series. */
  id: string | null;
  kind: UpcomingKind;
  payee: string;
  /** "HDFC XX9012" for notices that name the account or card; always null for expected items. */
  account_ref: string | null;
  amount: string;
  /** A card bill's minimum due; null otherwise. */
  min_amount: string | null;
  /** The due date; for expected items, the series' next expected date. */
  date: string;
  status: UpcomingStatus;
  /** Card bills: card payments received since the notice; "0.00" otherwise. */
  paid_amount: string;
  /** Whether the money leaves the bank account (false for card-charged and cash items). */
  leaves_bank: boolean;
}

/** Mirrors `UpcomingList` in upcoming.py: sorted by date, then card bills, auto-debits, expected, then payee. No total. */
export interface UpcomingList {
  currency: string;
  items: UpcomingItem[];
}

/** "upcoming": salary expected after today; "today"/"late": expected today / already past (items up to today count);
 * "month_end": fewer than 2 salaries in the last 120 days, so it runs to the end of the month. */
export type PaydayState = "upcoming" | "today" | "late" | "month_end";

/** Why an item isn't subtracted. */
export type SafeNote = "card_or_cash" | "paid" | "not_seen";

/** Mirrors `SafeItem` in the backend's safe_to_spend.py. Amounts are decimal strings, `date` "YYYY-MM-DD" (IST). */
export interface SafeItem {
  date: string;
  payee: string;
  kind: UpcomingKind;
  status: UpcomingStatus;
  amount: string;
  min_amount: string | null;
  paid_amount: string;
  /** What was taken off Balance left; "0.00" when `note` says why not. */
  subtracted: string;
  note: SafeNote | null;
}

/** Mirrors `SafeToSpend` in safe_to_spend.py. Amounts are decimal strings, dates "YYYY-MM-DD" (IST). */
export interface SafeToSpend {
  currency: string;
  /** Balance left. */
  balance: string;
  /** The expected salary date; for "month_end", the 1st of next month. */
  next_payday: string;
  payday_state: PaydayState;
  /** Days from today to payday (today counted, payday not); null when salary is due today or late. */
  days: number | null;
  due: SafeItem[];
  /** Balance left minus what's subtracted; negative when short. */
  safe: string;
  /** Whole rupees a day; null when not positive, or salary is due today or late. */
  per_day: string | null;
}

/** Every setting (server: settings_store.KEYS). Later designs add their keys here. */
export interface Settings {
  /** Whole rupees; null = Off. */
  "alerts.large_amount": number | null;
  "alerts.unusual": boolean;
  /** Warn once when a spend limit is this full: 50–95 in steps of 5; null = Off. Default 80. */
  "limits.warn_percent": number | null;
  /** Whole rupees: one notification when a payment takes Balance left below this; null = Off (default). */
  "alerts.low_balance": number | null;
  /** Months start on payday (pay_periods.py); default false. */
  "periods.payday": boolean;
  /** SMS watchdog (server watchdog.py): a daily 9 pm check of the SMS pipeline; default true. */
  "watchdog.enabled": boolean;
  /** Days with no bank SMS before a warning, 2–14; default 4. */
  "watchdog.quiet_days": number;
  /** Warn when salary is more than 3 days past its usual date; default true. */
  "watchdog.salary_check": boolean;
  /** Also email watchdog warnings (used only when Gmail is configured on the server); default true. */
  "watchdog.email": boolean;
}

/** One pay period (server: pay_periods.PayPeriodOut). IST "YYYY-MM-DD"; `end` inclusive (the newest one's is its latest end). */
export interface PayPeriod {
  month: string;
  start: string;
  end: string;
}

/** GET /api/v1/periods. Off: enabled false, []. On with no salary: enabled true, []. */
export interface PayPeriods {
  enabled: boolean;
  periods: PayPeriod[];
}

/** Mirrors `RefundWatchOut` in the backend's refunds.py. */
export interface RefundWatch {
  transaction_id: string;
  /** Decimal string, "2499.00". */
  expected_amount: string;
  /** "YYYY-MM-DD" (IST). */
  due_date: string;
  credit_id: string | null;
  state: "expected" | "refunded";
}

/** Body of `POST /api/v1/refunds`. */
export interface RefundWatchInput {
  transaction_id: string;
  /** Plain decimal string, e.g. "2499". */
  amount: string;
  /** "YYYY-MM-DD", 1 to 60 days from today (IST). */
  due_date: string;
}
