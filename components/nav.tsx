"use client";

import { ChartColumnBig, House, ReceiptText, Search, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";

import { Wordmark } from "./brand";
import { useData } from "./data-provider";
import { Avatar, cx } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/report", label: "Report", icon: ChartColumnBig },
  { href: "/activity", label: "Activity", icon: ReceiptText },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** A tab stays lit on its sub-routes too (e.g. /settings/limits is still Settings). */
function isActive(href: string, pathname: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function useSearchAction() {
  const router = useRouter();
  const { requestActivity } = useData();
  return () => {
    requestActivity({ focusSearch: true });
    router.push("/activity");
  };
}

const BAR_PADDING = 6; // px between the capsule edge and the lens
const DRAG_THRESHOLD = 8; // px of sideways travel before a press becomes a drag

interface Gesture {
  pointerId: number;
  startX: number;
  dragging: boolean;
}

/** The bar's geometry, read fresh on every event: a rotation mid-slide moves it. */
interface BarBox {
  rect: DOMRect;
  slot: number;
}

const hasModifier = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

/**
 * Floating liquid-glass tab bar (iOS 26 style). A lens springs to the active tab; while a
 * finger is down it swells into a clear bubble. Slide along the bar and the bubble follows
 * the finger; let go to switch to the tab under it. Taps and slides both navigate on release,
 * since the browser often sends no click after one; keyboard and screen-reader activation (and
 * modifier-clicks, for a new tab) go through the links as usual.
 * Search lives on the Home screen and in Activity, not here.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const gesture = useRef<Gesture | null>(null);
  /** The last press already navigated, so the click the browser may still send must not. */
  const pointerHandled = useRef(false);
  const [pressed, setPressed] = useState<number | null>(null);
  /** While dragging: how far the lens is from the first slot, in px, following the finger. */
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  // Keeps the lens on a chosen tab until the route actually changes (no flicker back).
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null);
  if (pending && pending.from !== pathname) setPending(null);

  const items = NAV;
  const activeIndex = items.findIndex((nav) => nav.href === pathname);
  const lensIndex = pressed ?? pending?.index ?? (activeIndex >= 0 ? activeIndex : null);
  const dragging = dragOffset !== null;

  const measure = (bar: HTMLElement): BarBox => {
    const rect = bar.getBoundingClientRect();
    return { rect, slot: (rect.width - BAR_PADDING * 2) / items.length };
  };
  const slotAt = (b: BarBox, x: number) => Math.min(items.length - 1, Math.max(0, Math.floor((x - BAR_PADDING) / b.slot)));
  // Lens centre under the finger, kept inside the capsule.
  const centreAt = (b: BarBox, clientX: number) =>
    Math.min(b.rect.width - BAR_PADDING - b.slot / 2, Math.max(BAR_PADDING + b.slot / 2, clientX - b.rect.left));

  const reset = () => {
    gesture.current = null;
    setPressed(null);
    setDragOffset(null);
  };

  const choose = (i: number) => {
    if (i !== activeIndex) {
      setPending({ index: i, from: pathname });
      router.push(items[i].href);
    } else if (pending) {
      // Back to the current tab mid-navigation: Next drops the in-flight load for this push, so
      // the pathname never changes to clear `pending`; clear it here.
      setPending(null);
      router.push(items[i].href);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Any click owed by the previous press has arrived by now; a stale flag would eat this one's.
    pointerHandled.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A second finger mustn't hijack the first one's gesture.
    if (gesture.current && gesture.current.pointerId !== e.pointerId) return;
    const b = measure(e.currentTarget);
    gesture.current = { pointerId: e.pointerId, startX: e.clientX, dragging: false };
    setPressed(slotAt(b, e.clientX - b.rect.left));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return;
      g.dragging = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep following even past the bar's edges
      } catch {
        // The pointer is already gone (NotFoundError); its pointerup/cancel still ends the slide.
      }
    }
    const b = measure(e.currentTarget);
    const centre = centreAt(b, e.clientX);
    setDragOffset(centre - BAR_PADDING - b.slot / 2);
    setPressed(slotAt(b, centre));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    reset();
    // Cmd/Ctrl/Shift/Alt-clicks open a new tab or window: leave those to the link.
    if (hasModifier(e)) return;
    // Navigate here rather than trusting the link's click: Chrome sends none once a finger has
    // wandered or slid, and a press released on another tab, the padding or off the bar clicks
    // no link (or the wrong one).
    const b = measure(e.currentTarget);
    if (g.dragging) {
      choose(slotAt(b, centreAt(b, e.clientX)));
    } else {
      // A tap released off the bar is a cancelled tap.
      const { left, right, top, bottom } = b.rect;
      const onBar = e.clientX >= left && e.clientX <= right && e.clientY >= top && e.clientY <= bottom;
      if (onBar) choose(slotAt(b, e.clientX - left));
    }
    pointerHandled.current = true;
  };

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
    >
      <div
        className="glass pointer-events-auto relative mx-auto flex h-[66px] max-w-md touch-none rounded-full select-none [-webkit-touch-callout:none]"
        style={{ padding: BAR_PADDING }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          if (e.pointerId === gesture.current?.pointerId) reset();
        }}
        onPointerLeave={(e) => {
          // A mouse wandering off mid-press cancels it; a slide is captured and carries on.
          const g = gesture.current;
          if (g && e.pointerId === g.pointerId && !g.dragging) reset();
        }}
        onClickCapture={(e) => {
          // Swallow the click that trails a press onPointerUp already acted on. Keyboard and
          // screen-reader clicks (detail 0, no pointerdown first) still reach the link.
          if (!pointerHandled.current || e.detail === 0 || hasModifier(e)) return;
          e.preventDefault();
          e.stopPropagation();
          pointerHandled.current = false;
        }}
      >
        {lensIndex !== null ? (
          <span
            aria-hidden
            className={cx("glass-lens absolute rounded-full", dragging ? "glass-follow" : "glass-spring", pressed !== null && "is-pressed")}
            style={{
              top: BAR_PADDING,
              bottom: BAR_PADDING,
              left: BAR_PADDING,
              width: `calc((100% - ${BAR_PADDING * 2}px) / ${items.length})`,
              transform: dragging
                ? `translateX(${dragOffset}px) scale(1.2)`
                : `translateX(${lensIndex * 100}%) scale(${pressed !== null ? 1.2 : 1})`,
            }}
          />
        ) : null}

        {items.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          const className = cx(
            "relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-[color,transform] duration-200 [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-violet",
            active ? "text-violet-strong" : "text-ink",
            pressed === i && "scale-110",
          );
          const body = (
            <>
              <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {item.label}
            </>
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              draggable={false} // stop desktop link-dragging from hijacking a slide
              // Keyboard and screen-reader activation come through here (pointer clicks are handled
              // on release); move the lens the same way, so Enter on the current tab mid-load clears it.
              onNavigate={() => setPending(active ? null : { index: i, from: pathname })}
              className={className}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const search = useSearchAction();
  const { user } = useData();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line/70 bg-surface/60 px-5 py-7 backdrop-blur lg:flex">
      <Link href="/" className="px-2" aria-label="Folio home">
        <Wordmark />
      </Link>
      <button
        type="button"
        onClick={search}
        className="mt-8 flex h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-3 shadow-card transition hover:text-ink-2"
      >
        <Search size={17} /> Search transactions
      </button>
      <nav aria-label="Main" className="mt-6 space-y-1">
        {NAV.map((nav) => {
          const active = isActive(nav.href, pathname);
          const Icon = nav.icon;
          return (
            <Link
              key={nav.href}
              href={nav.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] transition",
                active ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? "text-violet" : undefined} />
              {nav.label}
            </Link>
          );
        })}
      </nav>
      {user ? (
        <Link href="/settings" className="mt-auto flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface">
          <Avatar name={user.name || user.email} picture={user.picture} className="size-10 ring-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{user.name || "Owner"}</span>
            <span className="block truncate text-xs text-ink-2">{user.email}</span>
          </span>
        </Link>
      ) : null}
    </aside>
  );
}
