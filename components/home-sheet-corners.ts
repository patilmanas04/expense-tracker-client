"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Corner radius of Home's content sheet while it sits below the header. */
export const SHEET_RADIUS = 32;
/** Distance from the top of the screen (px) over which the corners square off. */
export const CORNER_RANGE = 80;

/**
 * Square off the top corners of Home's content sheet as it scrolls up to the top of the screen:
 * SHEET_RADIUS while its top is CORNER_RANGE or more below, 0 once it gets there. Writes
 * `--home-radius` on the sheet, which its `rounded-t-(--home-radius)` reads. Browsers with
 * scroll-driven animations get this from the `.home-sheet` rule in globals.css instead (keep the
 * numbers in sync), so this only runs where those are missing: iOS 18 and older, Firefox.
 */
export function useSheetCorners(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports("animation-timeline: view()")) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      const radius = SHEET_RADIUS * Math.min(1, Math.max(0, top / CORNER_RANGE));
      el.style.setProperty("--home-radius", `${radius}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.style.removeProperty("--home-radius");
    };
  }, [ref]);
}
