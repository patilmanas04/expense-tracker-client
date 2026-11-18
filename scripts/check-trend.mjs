// Checks the trend maths, the calendar cells and the shading with plain Node (no test framework):
//   node scripts/check-trend.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
import assert from "node:assert/strict";

import { SHADE_PERCENT, calendarCells, shadeStep } from "../lib/calendar.ts";
import { summarizeTrend } from "../lib/trend.ts";

/* ---------- calendarCells ---------- */

const oct = calendarCells("2026-10"); // 1 Oct 2026 is a Thursday
assert.equal(oct.length, 35);
assert.deepEqual(oct.slice(0, 3), [null, null, null]);
assert.equal(oct[3], "2026-10-01");
assert.equal(oct[33], "2026-10-31");
assert.equal(oct[34], null);

const nov = calendarCells("2026-11"); // 1 Nov 2026 is a Sunday
assert.equal(nov.length, 42);
assert.deepEqual(nov.slice(0, 6), [null, null, null, null, null, null]);
assert.equal(nov[6], "2026-11-01");

const jun = calendarCells("2026-06"); // 1 Jun 2026 is a Monday
assert.equal(jun[0], "2026-06-01");
assert.equal(jun.length, 35);

const feb = calendarCells("2027-02"); // 1 Feb 2027 is a Monday, 28 days
assert.equal(feb.length, 28);
assert.ok(feb.every((c) => c !== null));
assert.equal(feb.at(-1), "2027-02-28");

assert.equal(calendarCells("2028-02").filter(Boolean).length, 29);

/* ---------- shadeStep ---------- */

for (const [spent, step] of [[0, 0], [1, 1], [25, 1], [26, 2], [50, 2], [51, 3], [75, 3], [76, 4], [100, 4]]) {
  assert.equal(shadeStep(spent, 100), step, `shadeStep(${spent}, 100)`);
}
assert.equal(shadeStep(5, 0), 0);
assert.equal(shadeStep(-1, 100), 0);
assert.deepEqual([...SHADE_PERCENT], [0, 12, 30, 55, 85]);

/* ---------- summarizeTrend ---------- */

const pts = (start, values) => {
  const [y, m] = start.split("-").map(Number);
  return values.map((expense, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, expense };
  });
};

// CUJ 1: Food & Dining on 18 Nov 2026, 6 months.
{
  const s = summarizeTrend(pts("2026-06", [610000, 680000, 910000, 610000, 840000, 410000]), "2026-11", {
    "2026-06": 300000,
    "2026-07": 350000,
    "2026-08": 450000,
    "2026-09": 320000,
    "2026-10": 380000,
    "2026-11": 410000,
  });
  assert.equal(s.shown.length, 6);
  assert.equal(s.average, 730000);
  assert.deepEqual(s.highest, { month: "2026-08", minor: 910000 });
  assert.equal(s.current.month, "2026-11");
  assert.equal(s.current.soFar, 410000);
  assert.equal(s.current.usualSoFar, 360000);
  assert.equal(Math.round(s.current.change * 100), 14);
}

// Leading months with nothing spent are dropped.
{
  const s = summarizeTrend(pts("2026-06", [0, 0, 500, 700, 600, 100]), "2026-11", {});
  assert.equal(s.shown[0].month, "2026-08");
  assert.equal(s.shown.length, 4);
}

// A month with nothing spent after the first stays drawn but is left out of the average.
{
  const s = summarizeTrend(pts("2026-08", [500, 0, 700, 100]), "2026-11", {});
  assert.deepEqual(
    s.shown.map((p) => p.month),
    ["2026-08", "2026-09", "2026-10", "2026-11"],
  );
  assert.equal(s.average, 600);
  assert.deepEqual(s.highest, { month: "2026-10", minor: 700 });
}

// Only the month in progress has spending: no average, no highest, no comparison.
{
  const s = summarizeTrend(pts("2026-06", [0, 0, 0, 0, 0, 900]), "2026-11", { "2026-11": 900 });
  assert.deepEqual(
    s.shown.map((p) => p.month),
    ["2026-11"],
  );
  assert.equal(s.average, null);
  assert.equal(s.highest, null);
  assert.deepEqual(s.current, { month: "2026-11", soFar: 900, usualSoFar: null, change: null });
}

// The month in progress with nothing spent still shows when every earlier month is empty.
{
  const s = summarizeTrend(pts("2026-06", [0, 0, 0, 0, 0, 0]), "2026-11", {});
  assert.deepEqual(
    s.shown.map((p) => p.month),
    ["2026-11"],
  );
  assert.equal(s.current.soFar, 0);
  assert.equal(s.average, null);
}

// A past end month: every shown month is complete, and there's no "so far".
{
  const s = summarizeTrend(pts("2026-04", [0, 300, 0, 500, 400, 600]), "2026-11", { "2026-09": 100 });
  assert.equal(s.shown[0].month, "2026-05");
  assert.equal(s.current, null);
  assert.equal(s.average, Math.round((300 + 500 + 400 + 600) / 4));
  assert.deepEqual(s.highest, { month: "2026-09", minor: 600 });
}

// Nothing at all with a past end: nothing to draw.
{
  const s = summarizeTrend(pts("2026-04", [0, 0, 0, 0, 0, 0]), "2026-11", {});
  assert.deepEqual(s, { shown: [], average: null, highest: null, current: null });
}

// Past months spent only after today's day: usualSoFar is 0, so there's no change.
{
  const s = summarizeTrend(pts("2026-09", [500, 700, 200]), "2026-11", { "2026-11": 200 });
  assert.equal(s.current.usualSoFar, 0);
  assert.equal(s.current.change, null);
  assert.equal(s.current.soFar, 200);
}

// A tie for the highest month goes to the earlier one.
{
  const s = summarizeTrend(pts("2026-08", [800, 300, 800, 100]), "2026-11", {});
  assert.deepEqual(s.highest, { month: "2026-08", minor: 800 });
}

console.log("check-trend: ok");
