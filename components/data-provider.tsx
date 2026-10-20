"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  availableMonths,
  currencies as listCurrencies,
  latestCreatedAt,
  mergeTransactions,
  preferredCurrency,
  prepare,
  type Txn,
} from "@/lib/analytics";
import {
  ApiError,
  clearBalance as apiClearBalance,
  getAllTransactions,
  getBalance,
  getMe,
  getNotifications,
  getTransactionsSince,
  markNotificationsRead as apiMarkNotificationsRead,
  saveBalance as apiSaveBalance,
  signOut as apiSignOut,
} from "@/lib/api";
import { dayKey, monthOf } from "@/lib/format";
import type { Balance, Inbox, User } from "@/lib/types";

export type Status = "loading" | "signed-out" | "ready" | "error";
export type KindFilter = "ALL" | "DEBIT" | "CREDIT" | "REVIEW";

/** A request from another screen to open Activity with a filter applied. */
export interface ActivityRequest {
  nonce: number;
  kind?: KindFilter;
  category?: string;
  /** "YYYY-MM"; omitted means all time. */
  month?: string;
  focusSearch?: boolean;
}

interface DataContextValue {
  status: Status;
  user: User | null;
  txns: Txn[];
  error: string | null;
  refreshing: boolean;
  today: string;
  month: string;
  setMonth: (month: string) => void;
  months: string[];
  currency: string;
  setCurrency: (currency: string) => void;
  currencies: string[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Running bank balance, or null until one is set in Settings. */
  balance: Balance | null;
  saveBalance: (amount: string) => Promise<void>;
  clearBalance: () => Promise<void>;
  /** In-app notifications (bell on Home). */
  inbox: Inbox;
  notificationsOpen: boolean;
  /** When the drawer was opened; used for "5m ago" labels. */
  notificationsOpenedAt: number;
  openNotifications: () => void;
  closeNotifications: () => void;
  markNotificationsRead: (ids?: string[]) => Promise<void>;
  selected: Txn | null;
  openTransaction: (id: string) => void;
  closeTransaction: () => void;
  activityRequest: ActivityRequest | null;
  requestActivity: (request: Omit<ActivityRequest, "nonce">) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const STALE_AFTER_MS = 60_000;
/** New SMS show up within this long while the app is open. */
export const POLL_INTERVAL_MS = 5_000;
/**
 * Re-check this far behind the newest row: two SMS arriving together can commit slightly
 * out of order (the server stamps created_at just before insert). Duplicates are dropped by id.
 */
const POLL_OVERLAP_MS = 15_000;
/** Consecutive failed polls before the "Couldn't refresh" banner appears. */
const POLL_FAILURES_BEFORE_ALERT = 3;
const EPOCH = "1970-01-01T00:00:00Z";

const EMPTY_INBOX: Inbox = { unread: 0, items: [] };

/** Skips a re-render when a poll returns what we already have. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type LoadResult =
  | { kind: "ok"; user: User; txns: Txn[]; balance: Balance | null; inbox: Inbox }
  | { kind: "signed-out" }
  | { kind: "error"; message: string };

async function fetchEverything(): Promise<LoadResult> {
  try {
    const user = await getMe();
    const [list, balance, inbox] = await Promise.all([
      getAllTransactions(),
      // The balance and notifications are optional; never let them block the dashboard.
      getBalance().catch(() => null),
      getNotifications().catch(() => EMPTY_INBOX),
    ]);
    return { kind: "ok", user, txns: prepare(list), balance, inbox };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: "signed-out" };
    return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState("");
  const [month, setMonth] = useState("");
  const [currency, setCurrency] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activityRequest, setActivityRequest] = useState<ActivityRequest | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [inbox, setInbox] = useState<Inbox>(EMPTY_INBOX);
  const [notificationsOpenedAt, setNotificationsOpenedAt] = useState(0); // 0 = closed
  const inFlight = useRef(false);
  const lastSyncedRef = useRef(0);
  const cursorRef = useRef(EPOCH); // newest created_at already loaded
  const pollFailures = useRef(0);

  const apply = useCallback((result: LoadResult, initial: boolean) => {
    if (result.kind === "ok") {
      const now = dayKey(Date.now());
      setUser(result.user);
      setTxns(result.txns);
      setBalance(result.balance);
      setInbox(result.inbox);
      setToday(now);
      setMonth((m) => m || monthOf(now));
      setCurrency((c) => c || preferredCurrency(result.txns));
      setError(null);
      setStatus("ready");
      lastSyncedRef.current = Date.now();
      cursorRef.current = latestCreatedAt(result.txns) ?? EPOCH;
      pollFailures.current = 0;
    } else if (result.kind === "signed-out") {
      setUser(null);
      setTxns([]);
      setStatus("signed-out");
    } else {
      setError(result.message);
      if (initial) setStatus("error"); // otherwise keep showing the last good data
    }
    setRefreshing(false);
  }, []);

  const load = useCallback(
    async (initial: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      const result = await fetchEverything();
      inFlight.current = false;
      apply(result, initial);
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    inFlight.current = true;
    void fetchEverything().then((result) => {
      inFlight.current = false;
      if (!cancelled) apply(result, true);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Coming back to the tab/home-screen app picks up SMS that arrived meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSyncedRef.current > STALE_AFTER_MS) {
        void load(lastSyncedRef.current === 0);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  /** Cheap 5-second check: only rows recorded since the newest one we have, plus the balance. */
  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [fresh, nextBalance, nextInbox] = await Promise.all([
        getTransactionsSince(new Date(Date.parse(cursorRef.current) - POLL_OVERLAP_MS).toISOString()),
        getBalance().catch(() => undefined), // keep the last value on a hiccup
        getNotifications().catch(() => undefined),
      ]);
      pollFailures.current = 0;
      if (fresh.length) {
        setTxns((current) => mergeTransactions(current, fresh));
        const newest = latestCreatedAt(prepare(fresh));
        if (newest && Date.parse(newest) > Date.parse(cursorRef.current)) cursorRef.current = newest;
      }
      if (nextBalance !== undefined) setBalance((current) => (same(current, nextBalance) ? current : nextBalance));
      if (nextInbox !== undefined) setInbox((current) => (same(current, nextInbox) ? current : nextInbox));
      setToday(dayKey(Date.now())); // React skips the render when the day hasn't changed
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setTxns([]);
        setStatus("signed-out");
      } else if (++pollFailures.current >= POLL_FAILURES_BEFORE_ALERT) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Poll while the app is open and visible; hidden tabs and locked phones don't poll.
  useEffect(() => {
    if (status !== "ready") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, poll]);

  const refresh = useCallback(() => load(status !== "ready"), [load, status]);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } finally {
      setUser(null);
      setTxns([]);
      setBalance(null);
      setInbox(EMPTY_INBOX);
      setSelectedId(null);
      setStatus("signed-out");
    }
  }, []);

  const saveBalance = useCallback(async (amount: string) => {
    setBalance(await apiSaveBalance(amount));
  }, []);

  const clearBalance = useCallback(async () => {
    await apiClearBalance();
    setBalance(null);
  }, []);

  const markNotificationsRead = useCallback(async (ids?: string[]) => {
    // Optimistic: the next poll corrects it if the request fails.
    setInbox((current) => {
      const items = current.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n));
      return { unread: items.filter((n) => !n.read).length, items };
    });
    try {
      const { unread } = await apiMarkNotificationsRead(ids);
      setInbox((current) => (current.unread === unread ? current : { ...current, unread }));
    } catch {
      // keep the optimistic state
    }
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      status,
      user,
      txns,
      error,
      refreshing,
      today,
      month,
      setMonth,
      months: today ? availableMonths(txns, monthOf(today)) : [],
      currency,
      setCurrency,
      currencies: listCurrencies(txns),
      refresh,
      signOut,
      balance,
      saveBalance,
      clearBalance,
      inbox,
      notificationsOpen: notificationsOpenedAt > 0,
      notificationsOpenedAt,
      openNotifications: () => setNotificationsOpenedAt(Date.now()),
      closeNotifications: () => setNotificationsOpenedAt(0),
      markNotificationsRead,
      selected: (selectedId && txns.find((t) => t.id === selectedId)) || null,
      openTransaction: setSelectedId,
      closeTransaction: () => setSelectedId(null),
      activityRequest,
      requestActivity: (request) => setActivityRequest({ ...request, nonce: Date.now() }),
    }),
    [
      status,
      user,
      txns,
      error,
      refreshing,
      today,
      month,
      currency,
      refresh,
      signOut,
      balance,
      saveBalance,
      clearBalance,
      inbox,
      notificationsOpenedAt,
      markNotificationsRead,
      selectedId,
      activityRequest,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}
