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
}

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
  /** Alert email already sent for this period and limit. */
  alerted: boolean;
}

export interface LimitsSummary {
  currency: string;
  weekly: PeriodLimit;
  monthly: PeriodLimit;
  email: { configured: boolean; to: string | null; last_error: string | null };
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
