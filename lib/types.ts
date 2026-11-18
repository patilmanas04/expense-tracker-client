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
