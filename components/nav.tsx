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
  left: number;
  width: number;
  slot: number;
  dragging: boolean;
}

/**
 * Floating liquid-glass tab bar (iOS 26 style). A lens springs to the active tab; while a
 * finger is down it swells into a clear bubble. Slide along the bar and the bubble follows
 * the finger; let go to switch to the tab under it. A plain tap still works as a link.
 * Search lives on the Home screen and in Activity, not here.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
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

  const slotAt = (g: Gesture, x: number) => Math.min(items.length - 1, Math.max(0, Math.floor((x - BAR_PADDING) / g.slot)));
  // Lens centre under the finger, kept inside the capsule.
  const centreAt = (g: Gesture, clientX: number) =>
    Math.min(g.width - BAR_PADDING - g.slot / 2, Math.max(BAR_PADDING + g.slot / 2, clientX - g.left));

  const reset = () => {
    gesture.current = null;
    setPressed(null);
    setDragOffset(null);
  };

  const choose = (i: number) => {
    if (i === activeIndex) return;
    setPending({ index: i, from: pathname });
    router.push(items[i].href);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const g: Gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      left: rect.left,
      width: rect.width,
      slot: (rect.width - BAR_PADDING * 2) / items.length,
      dragging: false,
    };
    gesture.current = g;
    setPressed(slotAt(g, e.clientX - rect.left));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return;
      g.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId); // keep following even past the bar's edges
    }
    const centre = centreAt(g, e.clientX);
    setDragOffset(centre - BAR_PADDING - g.slot / 2);
    setPressed(slotAt(g, centre));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.dragging) {
      // The drag picked the tab; swallow the click the browser may still send afterwards.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 400);
      choose(slotAt(g, centreAt(g, e.clientX)));
    } else {
      // A plain tap: the link's own click navigates; just hold the lens there meanwhile.
      const i = slotAt(g, e.clientX - g.left);
      if (i !== activeIndex) setPending({ index: i, from: pathname });
    }
    reset();
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
        onPointerCancel={reset}
        onPointerLeave={() => !gesture.current?.dragging && reset()}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
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
          const active = pathname === nav.href;
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
