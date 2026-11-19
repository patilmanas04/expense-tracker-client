"use client";

import { ArrowDownUp, BadgeAlert, BellOff, ChevronRight, Copy, CreditCard, Gauge, MessageSquareWarning, Repeat, TrendingUp, TriangleAlert, Undo2, Wallet, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { needsReview } from "@/lib/analytics";
import { timeAgo } from "@/lib/format";
import { activityRequestFromLink } from "@/lib/links";
import type { AppNotification } from "@/lib/types";

import { useData } from "./data-provider";
import { lockPageScroll, useSheetDrag } from "./sheet-drag";
import { SwipeToDelete } from "./swipe-to-delete";
import { IconTile, cx } from "./ui";

const LIMITS_PATH = "/settings/limits";
/** Where limit alerts linked before limits got a page of their own. */
const OLD_LIMITS_PATH = "/settings#limits";

/** Icon and colour per notification kind; later designs add one entry each. */
const KIND_STYLES: Record<string, { icon: LucideIcon; color: string }> = {
  spend_limit: { icon: Gauge, color: "#FF6F4F" },
  spend_warning: { icon: Gauge, color: "#F79009" },
  duplicate: { icon: Copy, color: "#EDA100" },
  payment_alert: { icon: BadgeAlert, color: "#F04438" },
  low_balance: { icon: Wallet, color: "#F04438" },
  recurring_new: { icon: Repeat, color: "#8458F5" },
  recurring_price: { icon: TrendingUp, color: "#F79009" },
  watchdog: { icon: MessageSquareWarning, color: "#F04438" },
  card_bill_due: { icon: CreditCard, color: "#F79009" },
  refund_match: { icon: Undo2, color: "#12B76A" },
  refund_overdue: { icon: Undo2, color: "#F79009" },
  self_transfer: { icon: ArrowDownUp, color: "#64748B" },
};
const DEFAULT_STYLE = { icon: Gauge, color: "#8458F5" };
const kindStyle = (kind: string) => KIND_STYLES[kind] ?? DEFAULT_STYLE;

/** Notifications behind the bell on Home: bottom sheet on phones, side panel on desktop. */
export function NotificationDrawer() {
  const {
    inbox,
    txns,
    notificationsOpen,
    notificationsOpenedAt,
    closeNotifications,
    markNotificationsRead,
    dismissNotification,
    clearNotifications,
    runNotificationAction,
    requestActivity,
  } = useData();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(panelRef, closeNotifications);
  const closeRef = useRef<HTMLButtonElement>(null);
  const review = txns.filter(needsReview).length;
  /** The notification whose button is being run; one at a time. */
  const [running, setRunning] = useState<string | null>(null);
  /** Error from a button, per notification, shown in its row until the next try. */
  const [failed, setFailed] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!notificationsOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNotifications();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, [href]");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [notificationsOpen, closeNotifications]);

  if (!notificationsOpen) return null;

  const go = (path: string) => {
    closeNotifications();
    router.push(path);
  };
  const open = (n: AppNotification) => {
    if (!n.read) void markNotificationsRead([n.id]);
    if (!n.link) return; // nothing to open (notifications with buttons have no link)
    // /activity?kind=review, ?tag=goa or ?txn=<id>: Activity with that filter, or that transaction's sheet.
    const request = activityRequestFromLink(n.link);
    if (request) {
      requestActivity(request);
      return go("/activity");
    }
    go(n.link === OLD_LIMITS_PATH ? LIMITS_PATH : n.link);
  };
  const act = async (n: AppNotification, path: string) => {
    if (running) return;
    setRunning(n.id);
    setFailed((current) => {
      if (!(n.id in current)) return current;
      const next = { ...current };
      delete next[n.id];
      return next;
    });
    if (!n.read) void markNotificationsRead([n.id]);
    try {
      await runNotificationAction(path);
    } catch (e) {
      setFailed((current) => ({ ...current, [n.id]: e instanceof Error ? e.message : "Something went wrong." }));
    } finally {
      setRunning(null);
    }
  };
  const openReview = () => {
    requestActivity({ kind: "REVIEW" });
    go("/activity");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div ref={backdropRef} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={closeNotifications} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        className="animate-sheet relative flex max-h-[85dvh] w-full flex-col rounded-t-[32px] bg-canvas pb-[max(env(safe-area-inset-bottom),1rem)] shadow-float sm:max-h-none sm:w-[400px] sm:rounded-l-[32px] sm:rounded-tr-none sm:pb-6"
      >
        {/* Grabber and title: swipe down here to close (phones). */}
        <div {...grabProps} className="flex shrink-0 touch-none flex-col select-none">
          <span className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" aria-hidden />
          <header className="flex items-center gap-2 px-5 pt-3 pb-3 sm:pt-7">
            <h2 id="notifications-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              Notifications
            </h2>
            {inbox.items.length ? (
              <button
                type="button"
                onClick={() => void clearNotifications()}
                className="glass relative h-9 rounded-full px-4 text-[15px] font-semibold text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
              >
                Clear
              </button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              onClick={closeNotifications}
              aria-label="Close notifications"
              className="glass relative grid size-9 place-items-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet"
            >
              <X size={18} />
            </button>
          </header>
          {inbox.unread ? (
            <p className="-mt-2 flex items-center gap-1 px-5 pb-2 text-sm text-ink-2">
              {inbox.unread} new ·
              <button
                type="button"
                onClick={() => void markNotificationsRead()}
                className="-mx-1.5 rounded-full px-1.5 py-0.5 font-medium text-violet-strong hover:bg-violet-soft"
              >
                Mark all read
              </button>
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {review ? (
            <div className="rounded-card shadow-card">
              <Row
                icon={TriangleAlert}
                color="#EDA100"
                title={`${review} ${review === 1 ? "item needs" : "items need"} review`}
                body="SMS Folio couldn't read, and possible duplicates. Tap to see them."
                onClick={openReview}
              />
            </div>
          ) : null}

          {inbox.items.length ? (
            <ul className="mt-2 space-y-2" aria-label="Notifications">
              {inbox.items.map((n) => (
                <li key={n.id}>
                  {/* Swipe left to delete; the drawer's background sits under the row so the red never shows through. */}
                  <SwipeToDelete
                    id={`note:${n.id}`}
                    onDelete={() => dismissNotification(n.id)}
                    className="rounded-card shadow-card"
                    contentClassName="rounded-card bg-canvas"
                  >
                    {n.actions.length || n.resolved ? (
                      <ActionRow
                        {...kindStyle(n.kind)}
                        notification={n}
                        meta={timeAgo(n.created_at, notificationsOpenedAt)}
                        busy={running === n.id}
                        error={failed[n.id]}
                        onOpen={() => open(n)}
                        onAction={(path) => void act(n, path)}
                      />
                    ) : (
                      <Row
                        {...kindStyle(n.kind)}
                        title={n.title}
                        body={n.body}
                        meta={timeAgo(n.created_at, notificationsOpenedAt)}
                        unread={!n.read}
                        onClick={() => open(n)}
                      />
                    )}
                  </SwipeToDelete>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-surface text-ink-3 shadow-card">
                <BellOff size={24} aria-hidden />
              </span>
              <p className="mt-4 font-semibold text-ink">No notifications</p>
              <p className="mt-1 text-sm text-ink-2">You&apos;ll be notified here when spending reaches a limit or a recurring payment is found or changes price.</p>
              <button
                type="button"
                onClick={() => go(LIMITS_PATH)}
                className="mt-5 h-10 rounded-full bg-ink px-5 text-sm font-semibold text-canvas"
              >
                Set spending limits
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  color,
  title,
  body,
  meta,
  unread = false,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  body: string;
  meta?: string;
  unread?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-3 rounded-card border p-3.5 text-left transition focus-visible:outline-2 focus-visible:outline-violet",
        unread ? "border-violet/25 bg-surface" : "border-line/70 bg-surface/70",
      )}
    >
      <RowText icon={icon} color={color} title={title} body={body} meta={meta} unread={unread} />
      <span className="flex shrink-0 flex-col items-center gap-2 self-center">
        {unread ? <span className="size-2 rounded-full bg-violet" aria-label="Unread" /> : null}
        <ChevronRight size={16} className="text-ink-3" aria-hidden />
      </span>
    </button>
  );
}

/** Icon tile, title, time and body: shared by both row kinds. */
function RowText({
  icon,
  color,
  title,
  body,
  meta,
  unread,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  body: string;
  meta?: string;
  unread: boolean;
}) {
  return (
    <>
      <IconTile icon={icon} color={color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          {/* Titles can end in a one-word UPI merchant: wrap it anywhere so the time keeps its room. */}
          <span className={cx("min-w-0 text-[15px] [overflow-wrap:anywhere] text-ink", unread ? "font-semibold" : "font-medium")}>{title}</span>
          {meta ? <span className="shrink-0 text-xs text-ink-2">{meta}</span> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug [overflow-wrap:anywhere] text-ink-2">{body}</span>
      </span>
    </>
  );
}

/** A notification with buttons: tapping the text only marks it read; once decided, the result replaces the buttons. */
function ActionRow({
  icon,
  color,
  notification: n,
  meta,
  busy,
  error,
  onOpen,
  onAction,
}: {
  icon: LucideIcon;
  color: string;
  notification: AppNotification;
  meta: string;
  busy: boolean;
  error?: string;
  onOpen: () => void;
  onAction: (path: string) => void;
}) {
  const unread = !n.read;
  return (
    <div className={cx("flex flex-col rounded-card border p-3.5", unread ? "border-violet/25 bg-surface" : "border-line/70 bg-surface/70")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-violet"
      >
        <RowText icon={icon} color={color} title={n.title} body={n.body} meta={meta} unread={unread} />
        {unread ? <span className="size-2 shrink-0 self-center rounded-full bg-violet" aria-label="Unread" /> : null}
      </button>
      <div className="pl-13">
        {n.resolved ? (
          <p className="mt-2 text-[13px] font-medium text-ink-2">{n.resolved}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2" aria-busy={busy}>
              {n.actions.map((a, i) => (
                <button
                  key={a.path}
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(a.path)}
                  className={cx(
                    "h-9 rounded-full px-4 text-sm transition active:scale-95 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-50",
                    i === 0 ? "bg-ink font-semibold text-canvas" : "border border-line bg-surface font-medium text-ink",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-[13px] text-expense">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
