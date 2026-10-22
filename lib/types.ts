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
  transaction_time: string;
  created_at: string;
  /** Moves on every change (an edit, a category filled in later); the polling cursor. */
  updated_at: string;
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

export interface LimitsSummary {
  currency: string;
  /** Overall ("All spending"). */
  weekly: PeriodLimit;
  monthly: PeriodLimit;
  /** Only categories that have a limit, in category order. */
  categories: CategoryLimitStatus[];
  email: { configured: boolean; to: string | null; last_error: string | null };
}

/** Body of `PUT /api/v1/limits`: decimal strings, or null for "no limit". */
export interface LimitsInput {
  /** A category; null for overall spending. Both limits null removes a category's limit. */
  category: string | null;
  weekly_limit: string | null;
  monthly_limit: string | null;
}

/** Mirrors `NotificationOut` / `Inbox` in the backend's notifications.py. */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Dashboard path to open on tap, e.g. "/settings#limits". */
  link: string | null;
  created_at: string;
  read: boolean;
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
