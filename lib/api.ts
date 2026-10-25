import type { Balance, Inbox, LimitsInput, LimitsSummary, NewTransaction, Transaction, TransactionPatch, User } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(0, "Can't reach Folio. Check your connection and try again.");
  }
  if (!response.ok) {
    let detail = response.status >= 500 ? "The Folio server isn't responding." : response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error page from the proxy; keep the generic message.
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const getMe = () => request<User>("/api/v1/auth/me");

export const getAuthConfig = () => request<{ google_enabled: boolean }>("/api/v1/auth/config");

export const signOut = () => request<{ status: string }>("/api/v1/auth/logout", { method: "POST" });

export const GOOGLE_SIGN_IN_URL = "/api/v1/auth/google";

export const getBalance = () => request<Balance | null>("/api/v1/balance");

/** `amount` is a plain decimal string ("125000.50") so no precision is lost in transit. */
export const saveBalance = (amount: string) =>
  request<Balance>("/api/v1/balance", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });

export const clearBalance = () => request<{ status: string }>("/api/v1/balance", { method: "DELETE" });

export const getLimits = () => request<LimitsSummary>("/api/v1/limits");

export const getNotifications = () => request<Inbox>("/api/v1/notifications?limit=30");

/** Swipe to delete: hides one notification (the alert still counts as sent, so it isn't repeated). */
export const dismissNotification = (id: string) => request<void>(`/api/v1/notifications/${id}`, { method: "DELETE" });

/** Clear: hides every notification. */
export const clearNotifications = () => request<void>("/api/v1/notifications", { method: "DELETE" });

/** Marks the given notifications read, or all of them when `ids` is omitted. */
export const markNotificationsRead = (ids?: string[]) =>
  request<{ unread: number }>("/api/v1/notifications/read", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
  });

/** Sets the overall limit, or one category's. */
export const saveLimits = (limits: LimitsInput) =>
  request<LimitsSummary>("/api/v1/limits", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(limits),
  });

/** A transaction added by hand (cash, or anything without an SMS). */
export const addTransaction = (input: NewTransaction) =>
  request<Transaction>("/api/v1/transactions", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

/** Changes only the fields given; a new category is remembered for the merchant. */
export const updateTransaction = (id: string, patch: TransactionPatch) =>
  request<Transaction>(`/api/v1/transactions/${id}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

/** Deletes for good. `keepalive` lets it finish while the page is closing. */
export const deleteTransaction = (id: string, keepalive = false) =>
  request<void>(`/api/v1/transactions/${id}`, { method: "DELETE", keepalive });

export const sendTestEmail = () => request<{ status: string; to: string }>("/api/v1/limits/test-email", { method: "POST" });

const PAGE_SIZE = 200; // backend maximum

/** Rows recorded at or after `since` (inclusive); usually an empty list. Used for 5-second polling. */
/** Rows added or changed since `since`: new SMS, edits, and categories filled in later. */
export const getTransactionsSince = (since: string) =>
  request<Transaction[]>(`/api/v1/transactions?limit=${PAGE_SIZE}&updated_after=${encodeURIComponent(since)}`);

/** Every transaction the owner can see, newest first. */
export async function getAllTransactions(): Promise<Transaction[]> {
  const all: Transaction[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request<Transaction[]>(`/api/v1/transactions?limit=${PAGE_SIZE}&offset=${offset}`);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}
