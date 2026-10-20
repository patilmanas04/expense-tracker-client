"use client";

import { useId, useLayoutEffect, useState } from "react";

import { formatMoney, formatPercent } from "@/lib/format";

import { Amount, cx } from "../ui";

export interface DonutSegment {
  name: string;
  minor: number;
  color: string;
  hatched?: boolean;
}

const SIZE = 260;
const C = SIZE / 2;
const OUTER = 118;
const INNER = 80;
const CORNER = 10;
const GAP = 5;

const point = (radius: number, angle: number) => [C + radius * Math.cos(angle), C + radius * Math.sin(angle)];

/**
 * Annular sector with rounded corners: the shape is inset by the corner radius and
 * then stroked with a round join of twice that width, which restores the full size.
 */
function segmentPath(start: number, end: number, corner: number) {
  const rOut = OUTER - corner;
  const rIn = INNER + corner;
  const inset = (r: number) => Math.asin(Math.min(1, (corner + GAP / 2) / r));
  const [o0, o1] = [start + inset(rOut), end - inset(rOut)];
  const [i0, i1] = [start + inset(rIn), end - inset(rIn)];
  const [ox0, oy0] = point(rOut, o0);
  const [ox1, oy1] = point(rOut, o1);
  const [ix1, iy1] = point(rIn, i1);
  const [ix0, iy0] = point(rIn, i0);
  const large = (a: number, b: number) => (b - a > Math.PI ? 1 : 0);
  return [
    `M ${ox0} ${oy0}`,
    `A ${rOut} ${rOut} 0 ${large(o0, o1)} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${rIn} ${rIn} 0 ${large(i0, i1)} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

export function Donut({
  segments,
  total,
  currency,
  centerLabel,
}: {
  segments: DonutSegment[];
  total: number;
  currency: string;
  centerLabel: string;
}) {
  const hatchId = useId();
  const [active, setActive] = useState<number | null>(null);

  // Hidden routes are kept mounted; don't come back to a stale selection.
  useLayoutEffect(() => () => setActive(null), []);

  if (total <= 0 || segments.length === 0) {
    return (
      <div className="relative mx-auto aspect-square w-full max-w-[280px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" aria-hidden>
          <circle cx={C} cy={C} r={(OUTER + INNER) / 2} fill="none" stroke="#F1F1F4" strokeWidth={OUTER - INNER} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <p className="max-w-[9rem] text-sm text-ink-2">{centerLabel}: nothing yet</p>
        </div>
      </div>
    );
  }

  // Largest slice starts at 12 o'clock and the ring runs clockwise, as in the reference.
  const shares = segments.map((s) => s.minor / total);
  const arcs = segments.map((s, i) => {
    const before = shares.slice(0, i).reduce((a, b) => a + b, 0);
    const start = -Math.PI / 2 + before * Math.PI * 2;
    const end = start + shares[i] * Math.PI * 2;
    return { ...s, share: shares[i], start, end, mid: (start + end) / 2 };
  });
  const highlighted = active ?? 0;
  const focus = arcs[highlighted];
  const [px, py] = point(OUTER - 6, focus.mid);
  const summary = arcs.map((a) => `${a.name} ${formatPercent(a.share)}`).join(", ");

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px] select-none" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full overflow-visible" role="img" aria-label={`${centerLabel}: ${summary}`}>
        <defs>
          <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="7" height="7" fill="#F1F1F4" />
            <rect width="2.6" height="7" fill="#D9D9DF" />
          </pattern>
        </defs>
        {arcs.length === 1 ? (
          <circle cx={C} cy={C} r={(OUTER + INNER) / 2} fill="none" stroke={arcs[0].color} strokeWidth={OUTER - INNER} />
        ) : (
          arcs.map((arc, i) => {
            const span = arc.end - arc.start;
            // Narrow slices get smaller corners so the inset geometry never inverts.
            const corner = Math.max(0.5, Math.min(CORNER, (span * INNER - GAP) / 2 - 0.5));
            const fill = arc.hatched ? `url(#${hatchId})` : arc.color;
            const lift = i === active ? 4 : 0;
            return (
              <path
                key={arc.name}
                d={segmentPath(arc.start, arc.end, corner)}
                fill={fill}
                stroke={fill}
                strokeWidth={corner * 2}
                strokeLinejoin="round"
                tabIndex={0}
                role="button"
                aria-label={`${arc.name}: ${formatMoney(arc.minor, currency)}, ${formatPercent(arc.share)}`}
                aria-pressed={i === active}
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
                // Mouse already selected it on hover; a tap toggles.
                onPointerUp={(e) => e.pointerType !== "mouse" && setActive((a) => (a === i ? null : i))}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={cx(
                  "cursor-pointer outline-none transition-[opacity,transform] duration-200",
                  active !== null && i !== active && "opacity-40",
                )}
                style={{ transform: `translate(${Math.cos(arc.mid) * lift}px, ${Math.sin(arc.mid) * lift}px)` }}
              />
            );
          })
        )}
      </svg>

      <span
        aria-hidden
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-night px-3 py-1.5 text-[13px] font-semibold text-white shadow-float transition-[left,top] duration-200"
        style={{ left: `${(px / SIZE) * 100}%`, top: `${(py / SIZE) * 100}%` }}
      >
        {formatPercent(focus.share)}
      </span>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div className="max-w-[60%]" aria-live="polite">
          <p className="truncate text-[15px] text-ink-2">{active === null ? centerLabel : focus.name}</p>
          <Amount
            minor={active === null ? total : focus.minor}
            currency={currency}
            className="mt-1 block text-[26px] leading-tight font-bold tracking-tight text-ink sm:text-[28px]"
            fractionClassName="text-ink-2"
          />
        </div>
      </div>
    </div>
  );
}
