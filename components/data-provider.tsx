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
  clearRecurringDecision as apiClearRecurringDecision,
  deleteTransaction as apiDeleteTransaction,
  getAllTransactions,
  getBalance,
  getLimits,
  getMe,
  getNotifications,
  getRecurring,
  getSettings,
  getTransactionsSince,
  clearNotifications as apiClearNotifications,
  dismissNotification as apiDismissNotification,
  markNotDuplicate as apiMarkNotDuplicate,
  markNotificationsRead as apiMarkNotificationsRead,
  runNotificationAction as apiRunNotificationAction,
  saveBalance as apiSaveBalance,
  saveLimits as apiSaveLimits,
  saveMerchantLimit as apiSaveMerchantLimit,
  saveSettings as apiSaveSettings,
  setRecurringDecision as apiSetRecurringDecision,
  signOut as apiSignOut,
  updateTransaction as apiUpdateTransaction,
} from "@/lib/api";
import { dayKey, monthOf } from "@/lib/format";
import type {
  Balance,
  Cadence,
  Inbox,
  LimitsInput,
  LimitsSummary,
  MerchantLimitInput,
  NewTransaction,
  RecurringDecision,
  RecurringSummary,
  Settings,
  TransactionPatch,
  User,
} from "@/lib/types";

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
  /** A normalised tag, without "#". */
  tag?: string;
  /** A transaction id: its sheet opens over Activity (the provider does this when the request is made). */
  txn?: string;
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
  /**
   * Reloads every transaction. Asked for while a poll (or another reload) is in flight, it runs right
   * after it, never dropped: `await refresh()` resolves only after the reload.
   */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Running bank balance, or null until one is set in Settings. */
  balance: Balance | null;
  /** `asOf` = when you read it (ISO with offset); omitted = now. */
  saveBalance: (amount: string, asOf?: string) => Promise<void>;
  clearBalance: () => Promise<void>;
  /** Weekly/monthly spend limits, overall, per category and per merchant, with what's been spent; null until loaded. */
  limits: LimitsSummary | null;
  saveLimits: (limits: LimitsInput) => Promise<LimitsSummary>;
  /** Adds, changes or removes one merchant's limit. */
  saveMerchantLimit: (body: MerchantLimitInput) => Promise<LimitsSummary>;
  /** Recurring series (Report's card and /report/recurring); null until loaded. */
  recurring: RecurringSummary | null;
  /** The last load of `recurring` failed (it keeps its last value). */
  recurringFailed: boolean;
  /** Reloads `recurring`; never throws: resolves false when it failed (which also sets `recurringFailed`). */
  refreshRecurring: () => Promise<boolean>;
  /**
   * Saves a decision on one series ("dismissed" = Not recurring, "cancelled" = Mark cancelled), or clears it
   * with null, then reloads `recurring`. Throws ApiError when the write fails; resolves false when it saved
   * but the reload failed (`recurring` still shows the series where it was).
   */
  decideRecurring: (merchantKey: string, cadence: Cadence, status: RecurringDecision | null) => Promise<boolean>;
  /** Alert settings and the like; null until loaded, or when the server didn't answer. */
  settings: Settings | null;
  /** Changes only the keys given. Throws ApiError; a 422 message names the key ("<key>: <message>"). */
  saveSettings: (changes: Partial<Settings>) => Promise<Settings>;
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
  /** Runs a notification's button, then refreshes transactions and the inbox. Throws ApiError (its message is shown in the row). */
  runNotificationAction: (path: string) => Promise<void>;
  /** Adds a transaction by hand; it appears in the lists straight away. */
  addTransaction: (input: NewTransaction) => Promise<Txn>;
  /** Edits a transaction; a new category is remembered for the merchant. */
  updateTransaction: (id: string, patch: TransactionPatch) => Promise<Txn>;
  /** "Not a duplicate": the transaction counts again. Throws ApiError (e.g. 409 when already decided). */
  markNotDuplicate: (id: string) => Promise<Txn>;
  /** Hides a transaction now and deletes it after `UNDO_MS`, unless undone. */
  deleteTransaction: (id: string) => void;
  /** Brings back the last deleted transaction while its undo window is open. */
  undoDelete: () => void;
  /** The last delete: still undoable ("pending"), or "failed" and put back. */
  deletion: Deletion | null;
  /**
   * Transactions deleted on screen that the server still has: waiting out Undo, or on their way.
   * A new list each time one is added or settles (deleted, undone or put back).
   */
  deleting: Txn[];
  /**
   * Runs the 5-second check now (new and changed transactions, the balance, notifications).
   * Resolves false without checking when a fetch is already in flight.
   */
  pollNow: () => Promise<boolean>;
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
  | { kind: "ok"; user: User; txns: Txn[]; balance: Balance | null; inbox: Inbox; settings: Settings | null }
  | { kind: "signed-out" }
  | { kind: "error"; message: string };

async function fetchEverything(): Promise<LoadResult> {
  try {
    const user = await getMe();
    const [list, balance, inbox, settings] = await Promise.all([
      getAllTransactions(),
      // The balance, notifications and settings are optional; never let them block the dashboard.
      getBalance().catch(() => null),
      getNotifications().catch(() => EMPTY_INBOX),
      getSettings().catch(() => null),
    ]);
    return { kind: "ok", user, txns: prepare(list), balance, inbox, settings };
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
  const [settings, setSettings] = useState<Settings | null>(null); // not polled; reloads with Sync
  const [recurring, setRecurring] = useState<RecurringSummary | null>(null);
  const [recurringFailed, setRecurringFailed] = useState(false);
  const [notificationsOpenedAt, setNotificationsOpenedAt] = useState(0); // 0 = closed
  const inFlight = useRef(false);
  const lastSyncedRef = useRef(0);
  const cursorRef = useRef(EPOCH); // newest updated_at already loaded
  const pollFailures = useRef(0);
  const limitsTxns = useRef<Txn[] | null>(null); // transactions the limits and recurring were last loaded for
  const reloadOptional = useRef(false); // the first load failed, so limits and recurring reload once it succeeds
  const deletedIds = useRef(new Set<string>()); // so a poll already in flight can't bring one back
  const pendingDelete = useRef<{ txn: Txn; timer: number } | null>(null); // waiting out its undo window
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [deleting, setDeleting] = useState<Txn[]>([]);
  const settle = useCallback((id: string) => setDeleting((current) => current.filter((t) => t.id !== id)), []);

  const apply = useCallback((result: LoadResult, initial: boolean) => {
    if (result.kind === "ok") {
      const now = dayKey(Date.now());
      setUser(result.user);
      setTxns(result.txns);
      setBalance(result.balance);
      setInbox(withoutHidden(result.inbox, hiddenNotes.current));
      // A failed settings load keeps the last value.
      setSettings((current) => (!result.settings || same(current, result.settings) ? current : result.settings));
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
      if (initial) {
        setStatus("error"); // otherwise keep showing the last good data
        reloadOptional.current = true; // their own loads likely failed with it
      }
    }
    setRefreshing(false);
  }, []);

  /** One full reload; the caller has checked nothing else is in flight. */
  const fetchAll = useCallback(
    async (initial: boolean) => {
      inFlight.current = true;
      setRefreshing(true);
      const result = await fetchEverything();
      inFlight.current = false;
      apply(result, initial);
    },
    [apply],
  );

  // Reloads asked for while a fetch was in flight; all of them are served by one reload as soon as it ends.
  const queued = useRef<(() => void)[]>([]);

  const drainQueued = useCallback(async () => {
    // Whatever is in flight drains the queue when it ends.
    while (queued.current.length && !inFlight.current) {
      const waiting = queued.current.splice(0);
      await fetchAll(false);
      waiting.forEach((resolve) => resolve());
    }
  }, [fetchAll]);

  const load = useCallback(
    async (initial: boolean) => {
      if (inFlight.current) return new Promise<void>((resolve) => queued.current.push(resolve));
      await fetchAll(initial);
      await drainQueued();
    },
    [fetchAll, drainQueued],
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

  // Optional too; a failure keeps the last value and is flagged so the Recurring screen can offer Try again.
  const loadRecurring = useCallback(
    () =>
      getRecurring().then(
        (next) => {
          setRecurring((current) => (same(current, next) ? current : next));
          setRecurringFailed(false);
          return true;
        },
        () => {
          setRecurringFailed(true);
          return false;
        },
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    inFlight.current = true;
    void fetchEverything().then((result) => {
      inFlight.current = false;
      if (!cancelled) apply(result, true);
      void drainQueued();
    });
    // In parallel, so Settings opens with the meters already filled in.
    void loadLimits();
    void loadRecurring();
    return () => {
      cancelled = true;
    };
  }, [apply, loadLimits, loadRecurring, drainQueued]);

  // New SMS change what's been spent and what recurs: refresh the meters and recurring. The first load already
  // has them, unless it failed and a retry (Try again, coming back to the tab) is what made the app ready.
  useEffect(() => {
    if (status !== "ready") return;
    if (limitsTxns.current === null ? reloadOptional.current : limitsTxns.current !== txns) {
      void loadLimits();
      void loadRecurring();
    }
    reloadOptional.current = false;
    limitsTxns.current = txns;
  }, [status, txns, loadLimits, loadRecurring]);

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
    if (inFlight.current) return false;
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
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setTxns([]);
        setStatus("expired");
      } else if (++pollFailures.current >= POLL_FAILURES_BEFORE_ALERT) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
      return true;
    } finally {
      inFlight.current = false;
      void drainQueued();
    }
  }, [drainQueued]);

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
      setDeleting([]);
      setBalance(null);
      setInbox(EMPTY_INBOX);
      setLimits(null);
      setSettings(null);
      setRecurring(null);
      setRecurringFailed(false);
      setSelectedId(null);
      setStatus("signed-out");
    }
  }, []);

  const saveBalance = useCallback(async (amount: string, asOf?: string) => {
    setBalance(await apiSaveBalance(amount, asOf));
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

  const saveMerchantLimit = useCallback(async (body: MerchantLimitInput) => {
    const next = await apiSaveMerchantLimit(body);
    setLimits(next);
    return next;
  }, []);

  const decideRecurring = useCallback(
    async (merchantKey: string, cadence: Cadence, status: RecurringDecision | null) => {
      if (status) await apiSetRecurringDecision({ merchant_key: merchantKey, cadence, status });
      else await apiClearRecurringDecision({ merchant_key: merchantKey, cadence });
      return loadRecurring(); // the decision is saved either way; false = the list couldn't reload
    },
    [loadRecurring],
  );

  const saveSettings = useCallback(async (changes: Partial<Settings>) => {
    const next = await apiSaveSettings(changes);
    setSettings(next);
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

  const markNotDuplicate = useCallback(
    async (id: string) => {
      try {
        const updated = await apiMarkNotDuplicate(id);
        const [txn] = prepare([updated]);
        setTxns((current) => mergeTransactions(current, [updated]));
        if (Date.parse(txn.updated_at) > Date.parse(cursorRef.current)) cursorRef.current = txn.updated_at;
        void reloadBalance(); // it counts in the balance again; limits reload with the transactions
        return txn;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void poll(); // decided elsewhere: show the server's state
        throw e;
      }
    },
    [reloadBalance, poll],
  );

  // Deleting is instant on screen; the server hears about it after the undo window.
  const commitDelete = useCallback(
    (txn: Txn, keepalive = false) => {
      apiDeleteTransaction(txn.id, keepalive).then(
        () => {
          settle(txn.id); // views showing the server's figures (the balance breakdown) refetch on this
          void reloadBalance();
          void loadLimits();
          // The list changed on screen before the server deleted it, so the txns effect reloaded too early.
          void loadRecurring();
        },
        () => {
          // Nothing disappears silently: put it back and say so.
          settle(txn.id);
          deletedIds.current.delete(txn.id);
          setTxns((current) => mergeTransactions(current, [txn]));
          setDeletion({ txn, status: "failed", until: Date.now() + UNDO_MS });
        },
      );
    },
    [reloadBalance, loadLimits, loadRecurring, settle],
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
      setDeleting((current) => [...current.filter((t) => t.id !== id), txn]);
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
    settle(waiting.txn.id);
    setDeletion(null);
  }, [settle]);

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

  // If a poll is already in flight this returns at once; the next 5-second poll brings the result.
  const runNotificationAction = useCallback(
    async (path: string) => {
      await apiRunNotificationAction(path);
      await poll();
    },
    [poll],
  );

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
      saveMerchantLimit,
      recurring,
      recurringFailed,
      refreshRecurring: loadRecurring,
      decideRecurring,
      settings,
      saveSettings,
      inbox,
      notificationsOpen: notificationsOpenedAt > 0,
      notificationsOpenedAt,
      openNotifications,
      closeNotifications,
      markNotificationsRead,
      dismissNotification,
      clearNotifications,
      runNotificationAction,
      addTransaction,
      updateTransaction,
      markNotDuplicate,
      deleteTransaction,
      undoDelete,
      deletion,
      dismissDeletion,
      deleting,
      pollNow: poll,
      selected: (selectedId && txns.find((t) => t.id === selectedId)) || null,
      openTransaction: setSelectedId,
      closeTransaction,
      activityRequest,
      requestActivity: (request) => {
        setActivityRequest({ ...request, nonce: Date.now() });
        // Opened here, at the time of the request, so Activity never updates this provider while rendering.
        // An unknown id opens nothing (`selected` stays null).
        if (request.txn) setSelectedId(request.txn);
      },
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
      saveMerchantLimit,
      recurring,
      recurringFailed,
      loadRecurring,
      decideRecurring,
      settings,
      saveSettings,
      inbox,
      notificationsOpenedAt,
      openNotifications,
      closeNotifications,
      closeTransaction,
      markNotificationsRead,
      dismissNotification,
      clearNotifications,
      runNotificationAction,
      addTransaction,
      updateTransaction,
      markNotDuplicate,
      deleteTransaction,
      undoDelete,
      deletion,
      dismissDeletion,
      deleting,
      poll,
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
