"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  availableMonths,
  currencies as listCurrencies,
  latestUpdatedAt,
  mergeTransactions,
  preferredCurrency,
  prepare,
  type Txn,
} from "@/lib/analytics";
import {
  ApiError,
  addTransaction as apiAddTransaction,
  clearBalance as apiClearBalance,
  deleteTransaction as apiDeleteTransaction,
  getAllTransactions,
  getBalance,
  getLimits,
  getMe,
  getNotifications,
  getTransactionsSince,
  clearNotifications as apiClearNotifications,
  dismissNotification as apiDismissNotification,
  markNotificationsRead as apiMarkNotificationsRead,
  saveBalance as apiSaveBalance,
  saveLimits as apiSaveLimits,
  signOut as apiSignOut,
  updateTransaction as apiUpdateTransaction,
} from "@/lib/api";
import { dayKey, monthOf } from "@/lib/format";
import type { Balance, Inbox, LimitsInput, LimitsSummary, NewTransaction, TransactionPatch, User } from "@/lib/types";

/** "expired": the backend rejected the session cookie; "signed-out": you signed out. */
export type Status = "loading" | "signed-out" | "expired" | "ready" | "error";
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
  /** Weekly/monthly spend limits, overall and per category, with what's been spent; null until loaded. */
  limits: LimitsSummary | null;
  saveLimits: (limits: LimitsInput) => Promise<LimitsSummary>;
  /** In-app notifications (bell on Home). */
  inbox: Inbox;
  notificationsOpen: boolean;
  /** When the drawer was opened; used for "5m ago" labels. */
  notificationsOpenedAt: number;
  openNotifications: () => void;
  closeNotifications: () => void;
  markNotificationsRead: (ids?: string[]) => Promise<void>;
  /** Swipe to delete one notification. */
  dismissNotification: (id: string) => Promise<void>;
  /** Clear every notification. */
  clearNotifications: () => Promise<void>;
  /** Adds a transaction by hand; it appears in the lists straight away. */
  addTransaction: (input: NewTransaction) => Promise<Txn>;
  /** Edits a transaction; a new category is remembered for the merchant. */
  updateTransaction: (id: string, patch: TransactionPatch) => Promise<Txn>;
  /** Hides a transaction now and deletes it after `UNDO_MS`, unless undone. */
  deleteTransaction: (id: string) => void;
  /** Brings back the last deleted transaction while its undo window is open. */
  undoDelete: () => void;
  /** The last delete: still undoable ("pending"), or "failed" and put back. */
  deletion: Deletion | null;
  dismissDeletion: () => void;
  selected: Txn | null;
  openTransaction: (id: string) => void;
  closeTransaction: () => void;
  activityRequest: ActivityRequest | null;
  requestActivity: (request: Omit<ActivityRequest, "nonce">) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** How long "Undo" is offered before a delete reaches the server. */
export const UNDO_MS = 5_000;

export interface Deletion {
  txn: Txn;
  status: "pending" | "failed";
  /** When the undo window closes (ms since epoch), for the countdown. */
  until: number;
}

const STALE_AFTER_MS = 60_000;
/** New SMS show up within this long while the app is open. */
export const POLL_INTERVAL_MS = 5_000;
/**
 * Re-check this far behind the newest row: two SMS arriving together can commit slightly
 * out of order (the server stamps the time just before insert). Duplicates are dropped by id.
 */
const POLL_OVERLAP_MS = 15_000;
/** Consecutive failed polls before the "Couldn't refresh" banner appears. */
const POLL_FAILURES_BEFORE_ALERT = 3;
const EPOCH = "1970-01-01T00:00:00Z";

const EMPTY_INBOX: Inbox = { unread: 0, items: [] };

/** Leaves out notifications you've just swiped away or cleared, in case the server hasn't caught up. */
function withoutHidden(inbox: Inbox, hidden: Set<string>): Inbox {
  if (!hidden.size || !inbox.items.some((n) => hidden.has(n.id))) return inbox;
  const unreadHidden = inbox.items.filter((n) => hidden.has(n.id) && !n.read).length;
  return { unread: Math.max(0, inbox.unread - unreadHidden), items: inbox.items.filter((n) => !hidden.has(n.id)) };
}

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
  const hiddenNotes = useRef(new Set<string>()); // swiped away or cleared; a poll in flight can't bring them back
  const [limits, setLimits] = useState<LimitsSummary | null>(null);
  const [notificationsOpenedAt, setNotificationsOpenedAt] = useState(0); // 0 = closed
  const inFlight = useRef(false);
  const lastSyncedRef = useRef(0);
  const cursorRef = useRef(EPOCH); // newest updated_at already loaded
  const pollFailures = useRef(0);
  const limitsTxns = useRef<Txn[] | null>(null); // transactions the limits were last loaded for
  const deletedIds = useRef(new Set<string>()); // so a poll already in flight can't bring one back
  const pendingDelete = useRef<{ txn: Txn; timer: number } | null>(null); // waiting out its undo window
  const [deletion, setDeletion] = useState<Deletion | null>(null);

  const apply = useCallback((result: LoadResult, initial: boolean) => {
    if (result.kind === "ok") {
      const now = dayKey(Date.now());
      setUser(result.user);
      setTxns(result.txns);
      setBalance(result.balance);
      setInbox(withoutHidden(result.inbox, hiddenNotes.current));
      setToday(now);
      setMonth((m) => m || monthOf(now));
      setCurrency((c) => c || preferredCurrency(result.txns));
      setError(null);
      setStatus("ready");
      lastSyncedRef.current = Date.now();
      cursorRef.current = latestUpdatedAt(result.txns) ?? EPOCH;
      pollFailures.current = 0;
    } else if (result.kind === "signed-out") {
      setUser(null);
      setTxns([]);
      setStatus("expired");
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

  // Optional, like the balance: a failure keeps the last value and never blocks the dashboard.
  const loadLimits = useCallback(
    () =>
      getLimits().then(
        (next) => setLimits((current) => (same(current, next) ? current : next)),
        () => {}, // keep what we have
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    inFlight.current = true;
    void fetchEverything().then((result) => {
      inFlight.current = false;
      if (!cancelled) apply(result, true);
    });
    // In parallel, so Settings opens with the meters already filled in.
    void loadLimits();
    return () => {
      cancelled = true;
    };
  }, [apply, loadLimits]);

  // New SMS change what's been spent: refresh the meters (the first load already has them).
  useEffect(() => {
    if (status !== "ready") return;
    if (limitsTxns.current !== null && limitsTxns.current !== txns) void loadLimits();
    limitsTxns.current = txns;
  }, [status, txns, loadLimits]);

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

  /** Cheap 5-second check: only rows added or changed since the newest change we have, plus the balance. */
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
      const kept = fresh.filter((t) => !deletedIds.current.has(t.id));
      if (kept.length) {
        setTxns((current) => mergeTransactions(current, kept));
        const newest = latestUpdatedAt(prepare(fresh));
        if (newest && Date.parse(newest) > Date.parse(cursorRef.current)) cursorRef.current = newest;
      }
      if (nextBalance !== undefined) setBalance((current) => (same(current, nextBalance) ? current : nextBalance));
      if (nextInbox !== undefined) {
        const visible = withoutHidden(nextInbox, hiddenNotes.current);
        setInbox((current) => (same(current, visible) ? current : visible));
      }
      setToday(dayKey(Date.now())); // React skips the render when the day hasn't changed
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setTxns([]);
        setStatus("expired");
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
    const waiting = pendingDelete.current; // a delete still waiting for its undo window goes first
    if (waiting) {
      window.clearTimeout(waiting.timer);
      pendingDelete.current = null;
      await apiDeleteTransaction(waiting.txn.id).catch(() => {});
    }
    try {
      await apiSignOut();
    } finally {
      setUser(null);
      setTxns([]);
      setBalance(null);
      setInbox(EMPTY_INBOX);
      setLimits(null);
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

  const saveLimits = useCallback(async (body: LimitsInput) => {
    const next = await apiSaveLimits(body);
    setLimits(next);
    return next;
  }, []);

  // The balance moves with a bank entry; the next poll would catch it, this is just sooner.
  const reloadBalance = useCallback(
    () => getBalance().then((next) => setBalance((current) => (same(current, next) ? current : next)), () => {}),
    [],
  );

  const addTransaction = useCallback(
    async (input: NewTransaction) => {
      const created = await apiAddTransaction(input);
      const [txn] = prepare([created]); // normalises the timestamps, as for polled rows
      setTxns((current) => mergeTransactions(current, [created]));
      if (Date.parse(txn.updated_at) > Date.parse(cursorRef.current)) cursorRef.current = txn.updated_at;
      void reloadBalance();
      return txn;
    },
    [reloadBalance],
  );

  const updateTransaction = useCallback(
    async (id: string, patch: TransactionPatch) => {
      const updated = await apiUpdateTransaction(id, patch);
      const [txn] = prepare([updated]);
      setTxns((current) => mergeTransactions(current, [updated]));
      if (Date.parse(txn.updated_at) > Date.parse(cursorRef.current)) cursorRef.current = txn.updated_at;
      void reloadBalance(); // amount, type or date may have moved it
      return txn;
    },
    [reloadBalance],
  );

  // Deleting is instant on screen; the server hears about it after the undo window.
  const commitDelete = useCallback(
    (txn: Txn, keepalive = false) => {
      apiDeleteTransaction(txn.id, keepalive).then(
        () => {
          void reloadBalance();
          void loadLimits();
        },
        () => {
          // Nothing disappears silently: put it back and say so.
          deletedIds.current.delete(txn.id);
          setTxns((current) => mergeTransactions(current, [txn]));
          setDeletion({ txn, status: "failed", until: Date.now() + UNDO_MS });
        },
      );
    },
    [reloadBalance, loadLimits],
  );

  /** Sends the delete waiting for its undo window right away; true if there was one. */
  const flushDelete = useCallback(
    (keepalive = false) => {
      const waiting = pendingDelete.current;
      if (!waiting) return false;
      pendingDelete.current = null;
      window.clearTimeout(waiting.timer);
      commitDelete(waiting.txn, keepalive);
      return true;
    },
    [commitDelete],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      const txn = txns.find((t) => t.id === id);
      if (!txn) return;
      flushDelete(); // only the latest delete can be undone
      deletedIds.current.add(id);
      setSelectedId((current) => (current === id ? null : current));
      setTxns((current) => current.filter((t) => t.id !== id));
      const timer = window.setTimeout(() => {
        if (pendingDelete.current?.txn.id !== id) return;
        flushDelete();
        setDeletion((current) => (current?.txn.id === id && current.status === "pending" ? null : current));
      }, UNDO_MS);
      pendingDelete.current = { txn, timer };
      setDeletion({ txn, status: "pending", until: Date.now() + UNDO_MS });
    },
    [txns, flushDelete],
  );

  const undoDelete = useCallback(() => {
    const waiting = pendingDelete.current;
    if (!waiting) return;
    pendingDelete.current = null;
    window.clearTimeout(waiting.timer);
    deletedIds.current.delete(waiting.txn.id);
    setTxns((current) => mergeTransactions(current, [waiting.txn]));
    setDeletion(null);
  }, []);

  const dismissDeletion = useCallback(() => setDeletion(null), []);

  // Leaving (closing the tab, switching apps, locking the phone) sends a waiting delete at once,
  // so it isn't lost; the undo offer goes with it.
  useEffect(() => {
    const leave = () => {
      if (document.visibilityState === "hidden" && flushDelete(true)) setDeletion((current) => (current?.status === "pending" ? null : current));
    };
    const close = () => flushDelete(true);
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", close);
    return () => {
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", close);
    };
  }, [flushDelete]);

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

  // Both hide at once; if the server refuses, the next poll brings the notifications back.
  const dismissNotification = useCallback(async (id: string) => {
    hiddenNotes.current.add(id);
    setInbox((current) => withoutHidden(current, hiddenNotes.current));
    try {
      await apiDismissNotification(id);
    } catch {
      hiddenNotes.current.delete(id);
    }
  }, []);

  const clearNotifications = useCallback(async () => {
    const ids = inbox.items.map((n) => n.id);
    ids.forEach((id) => hiddenNotes.current.add(id));
    setInbox(EMPTY_INBOX);
    try {
      await apiClearNotifications();
    } catch {
      ids.forEach((id) => hiddenNotes.current.delete(id));
    }
  }, [inbox]);

  // Stable, so an open sheet's effects don't re-run (and move focus) whenever other data changes.
  const openNotifications = useCallback(() => setNotificationsOpenedAt(Date.now()), []);
  const closeNotifications = useCallback(() => setNotificationsOpenedAt(0), []);
  const closeTransaction = useCallback(() => setSelectedId(null), []);

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
      limits,
      saveLimits,
      inbox,
      notificationsOpen: notificationsOpenedAt > 0,
      notificationsOpenedAt,
      openNotifications,
      closeNotifications,
      markNotificationsRead,
      dismissNotification,
      clearNotifications,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      undoDelete,
      deletion,
      dismissDeletion,
      selected: (selectedId && txns.find((t) => t.id === selectedId)) || null,
      openTransaction: setSelectedId,
      closeTransaction,
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
      limits,
      saveLimits,
      inbox,
      notificationsOpenedAt,
      openNotifications,
      closeNotifications,
      closeTransaction,
      markNotificationsRead,
      dismissNotification,
      clearNotifications,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      undoDelete,
      deletion,
      dismissDeletion,
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
