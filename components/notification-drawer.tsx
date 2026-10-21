"use client";

import { BellOff, ChevronRight, Gauge, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { timeAgo } from "@/lib/format";
import type { AppNotification } from "@/lib/types";

import { useData } from "./data-provider";
import { useSheetDrag } from "./sheet-drag";
import { IconTile, cx } from "./ui";

const LIMITS_PATH = "/settings#limits";

/** Notifications behind the bell on Home: bottom sheet on phones, side panel on desktop. */
export function NotificationDrawer() {
  const {
    inbox,
    txns,
    notificationsOpen,
    notificationsOpenedAt,
    closeNotifications,
    markNotificationsRead,
    requestActivity,
  } = useData();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const { backdropRef, grabProps } = useSheetDrag(panelRef, closeNotifications);
  const closeRef = useRef<HTMLButtonElement>(null);
  const review = txns.filter((t) => !t.is_parsed).length;

  useEffect(() => {
    if (!notificationsOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
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
      document.body.style.overflow = overflow;
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
    go(n.link || LIMITS_PATH);
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
          <header className="flex items-center gap-3 px-5 pt-3 pb-3 sm:pt-7">
            <h2 id="notifications-title" className="flex-1 text-xl font-semibold tracking-tight text-ink">
              Notifications
              {inbox.unread ? <span className="ml-2 align-middle text-sm font-medium text-ink-2">{inbox.unread} new</span> : null}
            </h2>
            {inbox.unread ? (
              <button
                type="button"
                onClick={() => void markNotificationsRead()}
                className="h-9 rounded-full px-3 text-sm font-medium text-violet-strong hover:bg-violet-soft"
              >
                Mark all read
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {review ? (
            <Row
              icon={TriangleAlert}
              color="#EDA100"
              title={`${review} SMS ${review === 1 ? "needs" : "need"} review`}
              body="Folio couldn't read these automatically. Tap to see them."
              onClick={openReview}
            />
          ) : null}

          {inbox.items.length ? (
            <ul className="mt-2 space-y-2" aria-label="Notifications">
              {inbox.items.map((n) => (
                <li key={n.id}>
                  <Row
                    icon={Gauge}
                    color={n.kind === "spend_limit" ? "#FF6F4F" : "#8458F5"}
                    title={n.title}
                    body={n.body}
                    meta={timeAgo(n.created_at, notificationsOpenedAt)}
                    unread={!n.read}
                    onClick={() => open(n)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-surface text-ink-3 shadow-card">
                <BellOff size={24} aria-hidden />
              </span>
              <p className="mt-4 font-semibold text-ink">No notifications yet</p>
              <p className="mt-1 text-sm text-ink-2">You&apos;ll be notified here when spending reaches your weekly or monthly limit.</p>
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
        "flex w-full items-start gap-3 rounded-card border p-3.5 text-left shadow-card transition hover:shadow-float focus-visible:outline-2 focus-visible:outline-violet",
        unread ? "border-violet/25 bg-surface" : "border-line/70 bg-surface/70",
      )}
    >
      <IconTile icon={icon} color={color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx("text-[15px] text-ink", unread ? "font-semibold" : "font-medium")}>{title}</span>
          {meta ? <span className="shrink-0 text-xs text-ink-2">{meta}</span> : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{body}</span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-2 self-center">
        {unread ? <span className="size-2 rounded-full bg-violet" aria-label="Unread" /> : null}
        <ChevronRight size={16} className="text-ink-3" aria-hidden />
      </span>
    </button>
  );
}
