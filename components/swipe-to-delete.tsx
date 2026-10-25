"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";

import { cx } from "./ui";

/** Width of the red Delete button when a row rests open. */
const ACTION = 88;
/** Let go beyond this share of the row's width and it deletes straight away (a "full swipe"). */
const FULL_SWIPE = 0.6;
/** Movement before deciding between a horizontal swipe and a vertical scroll. */
const SLOP = 8;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

// Only one row rests open at a time, across the whole app (like iOS lists).
let openRow: string | null = null;
const listeners = new Set<() => void>();
const setOpenRow = (id: string | null) => {
  openRow = id;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

type Drag = { id: number; x: number; y: number; from: number; horizontal: boolean | null; lastX: number; lastT: number; velocity: number };

/**
 * iOS swipe to delete. Swipe left to reveal a red Delete; let go past halfway and the row rests
 * open, otherwise it springs back; a long swipe deletes at once. Tapping elsewhere, scrolling or
 * opening another row closes it. Vertical scrolling is left to the browser (`touch-action: pan-y`).
 *
 * `removes`: the row disappears after deleting (it collapses first); otherwise it slides back.
 * If `onDelete` throws, the row comes back.
 */
export function SwipeToDelete({
  id,
  onDelete,
  label = "Delete",
  disabled = false,
  removes = true,
  className,
  contentClassName,
  children,
}: {
  id: string;
  onDelete: () => void | Promise<unknown>;
  label?: string;
  disabled?: boolean;
  removes?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [height, setHeight] = useState<number | null>(null); // set while collapsing away
  const [rowWidth, setRowWidth] = useState(360); // measured when a swipe starts
  const open = useSyncExternalStore(subscribe, () => openRow === id, () => false);

  // Another row opened (or something closed this one): spring back.
  if (!open && !dragging && !leaving && offset !== 0) setOffset(0);

  // Tapping anywhere else or scrolling the page closes an open row.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!rowRef.current?.contains(e.target as Node)) setOpenRow(null);
    };
    const scrolled = () => setOpenRow(null);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolled);
    };
  }, [open]);

  // A row that's gone from the list mustn't stay "open".
  useEffect(() => () => {
    if (openRow === id) setOpenRow(null);
  }, [id]);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Slide the row out, fold its height away, then delete (or, if it stays, slide back).
  const remove = async () => {
    const row = rowRef.current;
    if (leaving || !row) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpenRow(null);
      await onDelete();
      return;
    }
    setLeaving(true);
    setRowWidth(row.offsetWidth);
    setOffset(-row.offsetWidth);
    await wait(200);
    if (removes) {
      setHeight(row.offsetHeight);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      setHeight(0);
      await wait(200);
    }
    try {
      await onDelete();
      if (!removes) {
        setLeaving(false);
        setOffset(0); // it stays in the list: slide back
      }
    } catch {
      setHeight(null); // it wasn't deleted: bring it back
      setLeaving(false);
      setOffset(0);
    } finally {
      if (openRow === id) setOpenRow(null);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || leaving || e.button !== 0 || drag.current) return;
    setRowWidth(e.currentTarget.offsetWidth);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: offset, horizontal: null, lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!d.horizontal) return void (drag.current = null); // a scroll: leave it to the browser
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      setOpenRow(id);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.velocity;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const next = d.from + dx;
    // Past the resting position it follows freely to the left; to the right it resists.
    setOffset(next > 0 ? Math.min(24, next / 4) : next);
  };

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.horizontal) return;
    setDragging(false);
    suppressClick.current = true; // the click that ends a swipe isn't a tap on the row
    setTimeout(() => (suppressClick.current = false), 0);
    const velocity = e.timeStamp - d.lastT > 80 ? 0 : d.velocity;
    if (offset < -rowWidth * FULL_SWIPE) return void remove();
    const rest = velocity < -0.4 || (velocity <= 0.4 && offset < -ACTION / 2);
    setOffset(rest ? -ACTION : 0);
    setOpenRow(rest ? id : null);
  };

  const revealed = Math.max(0, -offset);
  const armed = revealed > rowWidth * FULL_SWIPE || leaving;

  return (
    <div
      ref={rowRef}
      className={cx("relative overflow-hidden select-none", className)}
      style={{
        touchAction: "pan-y",
        ...(height !== null ? { height, opacity: height ? 1 : 0, transition: `height 200ms ${EASE}, opacity 200ms` } : {}),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(e) => {
        if (suppressClick.current || (open && !(e.target as Element).closest("[data-swipe-action]"))) {
          e.preventDefault();
          e.stopPropagation();
          if (!suppressClick.current) setOpenRow(null); // a tap on an open row closes it
        }
      }}
    >
      {/* The red action fills exactly the gap the swipe opens, rounded on every corner like the
          card, so it reads as its own pill; it widens as you swipe and fills the row on a full swipe. */}
      <div
        className="absolute inset-y-0 right-0 overflow-hidden"
        style={{
          width: revealed,
          opacity: revealed > 0 ? 1 : 0,
          // Set here, with fallbacks, so it shows even if a stylesheet is out of date.
          backgroundColor: "var(--color-danger, #d4213d)",
          borderRadius: "var(--radius-card, 24px)",
        }}
        aria-hidden={!open}
      >
        <button
          type="button"
          data-swipe-action
          tabIndex={open ? 0 : -1}
          onClick={() => void remove()}
          className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-white"
          style={{
            width: ACTION,
            // On a full swipe the label jumps to stay next to the row, as on iOS.
            transform: `translateX(${armed ? -Math.max(0, revealed - ACTION) : 0}px)`,
            transition: dragging ? `transform 160ms ${EASE}` : `transform 200ms ${EASE}`,
          }}
        >
          <Trash2 size={20} aria-hidden />
          {label}
        </button>
      </div>
      <div
        className={cx("relative", contentClassName)}
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging ? "none" : `transform 260ms ${EASE}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
