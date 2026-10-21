"use client";

import { useRef, type PointerEvent, type RefObject } from "react";

/** Let go past this share of the sheet's height and it closes. */
const CLOSE_DISTANCE = 0.3;
/** A downward flick faster than this (px/ms) closes it from any distance. */
const CLOSE_VELOCITY = 0.5;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

type Drag = { id: number; startY: number; dy: number; lastY: number; lastT: number; velocity: number };

/**
 * Swipe a bottom sheet down by its grabber to close it, as on iOS: the sheet follows the finger,
 * the backdrop fades with it, and letting go either slides it away or springs it back.
 * Pass the sheet's ref, spread `grabProps` on the grabber (give it `touch-none select-none`)
 * and attach `backdropRef`. Buttons inside the grabber still work. Phones only: from `sm` up
 * the sheet is a dialog or side panel.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const place = (dy: number, ms = 0) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
    sheet.style.transform = `translate3d(0, ${dy}px, 0)`;
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = ms ? `opacity ${ms}ms ${EASE}` : "none";
      backdrop.style.opacity = String(1 - Math.min(1, Math.max(0, dy) / sheet.offsetHeight));
    }
  };

  const end = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || e.pointerId !== d.id || !sheet) return;
    drag.current = null;
    const height = sheet.offsetHeight;
    // A finger that paused before lifting isn't a flick.
    const velocity = e.timeStamp - d.lastT > 80 ? 0 : d.velocity;
    const close = !cancelled && (d.dy > height * CLOSE_DISTANCE || (velocity > CLOSE_VELOCITY && d.dy > 12));
    if (!close) return place(0, 280);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    // Keep the flick's speed: a fast swipe finishes quickly, a slow drag glides out.
    const ms = Math.round(Math.min(280, Math.max(140, (height - d.dy) / Math.max(velocity, 1.2))));
    place(height + 24, ms);
    window.setTimeout(onClose, ms);
  };

  const grabProps = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || drag.current || matchMedia("(min-width: 640px)").matches) return;
      if ((e.target as Element).closest("button, a")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, startY: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const raw = e.clientY - d.startY;
      // Free downwards; upwards it resists, like pulling against a spring.
      d.dy = raw >= 0 ? raw : -2 * Math.sqrt(-raw);
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.velocity = 0.8 * ((e.clientY - d.lastY) / dt) + 0.2 * d.velocity;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      place(d.dy);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
  };

  return { backdropRef, grabProps };
}
