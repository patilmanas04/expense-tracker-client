// Checks the pay-period calendar, the expected last day, the period calendar cells and the labels with plain Node
// (no test framework):
//   node scripts/check-periods.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
// lib/periods.ts, lib/calendar.ts and lib/format.ts have no runtime imports Node can't load.
import assert from "node:assert/strict";

import { calendarCells, calendarCellsBetween } from "../lib/calendar.ts";
import { periodLabel, shortDayLabel } from "../lib/format.ts";
import { expectedLastDay, monthCalendar } from "../lib/periods.ts";

// CUJ 1: salary on 30 Sep and 31 Oct 2026.
const P = [
  { month: "2026-10", start: "2026-09-30", end: "2026-10-30" },
  { month: "2026-11", start: "2026-10-31", end: "2026-12-15" },
];

/* ---------- 1. Off: calendar months, exactly as before ---------- */

for (const data of [null, { enabled: false, periods: [] }, { enabled: true, periods: [] }, { enabled: false, periods: P }]) {
  const cal = monthCalendar(data, "2026-11-18");
  const what = JSON.stringify(data);
  assert.equal(cal.payday, false, what);
  assert.equal(cal.current, "2026-11", what);
  assert.equal(cal.first("2026-11"), "2026-11-01", what);
  assert.equal(cal.last("2026-11"), "2026-11-30", what);
  assert.equal(cal.last("2027-02"), "2027-02-28", what);
  assert.equal(cal.last("2028-02"), "2028-02-29", what);
  assert.equal(cal.dayIndex("2026-11-18"), 18, what);
  assert.equal(cal.monthOf("2026-10-31"), "2026-10", what);
}
assert.equal(monthCalendar(null, "").current, "");

/* ---------- 2. CUJ 1: on 10 Nov ---------- */

{
  const cal = monthCalendar({ enabled: true, periods: P }, "2026-11-10");
  assert.equal(cal.payday, true);
  assert.equal(cal.current, "2026-11");
  assert.equal(cal.monthOf("2026-10-31"), "2026-11");
  assert.equal(cal.monthOf("2026-10-30"), "2026-10");
  assert.equal(cal.monthOf("2026-09-30"), "2026-10");
  assert.equal(cal.monthOf("2026-09-29"), "2026-09");
  assert.equal(cal.first("2026-11"), "2026-10-31");
  assert.equal(cal.last("2026-11"), "2026-11-29"); // the expected last day
  assert.equal(cal.first("2026-10"), "2026-09-30");
  assert.equal(cal.last("2026-10"), "2026-10-30");
  assert.equal(cal.first("2026-09"), "2026-09-01"); // before the first salary: September, cut
  assert.equal(cal.last("2026-09"), "2026-09-29");
  assert.equal(cal.dayIndex("2026-11-10"), 11);
  assert.equal(cal.dayIndex("2026-10-31"), 1);
  assert.equal(cal.dayIndex("2026-10-30"), 31);
  assert.equal(cal.dayIndex("2026-09-29"), 29);
  // Cached answers stay the same.
  assert.equal(cal.last("2026-11"), "2026-11-29");
}

/* ---------- 3. CUJ 2: salary late, on 2 Dec ---------- */

{
  const cal = monthCalendar({ enabled: true, periods: P }, "2026-12-02");
  assert.equal(cal.current, "2026-11");
  assert.equal(cal.last("2026-11"), "2026-12-02"); // never before today
  assert.equal(cal.dayIndex("2026-12-02"), 33);
}

/* ---------- 4. CUJ 4: salary stopped, on 20 Dec ---------- */

{
  const cal = monthCalendar({ enabled: true, periods: P }, "2026-12-20");
  assert.equal(cal.current, "2026-12");
  assert.equal(cal.first("2026-12"), "2026-12-16");
  assert.equal(cal.last("2026-12"), "2026-12-31");
  assert.equal(cal.last("2026-11"), "2026-12-15"); // closed: its latest end
  assert.equal(cal.dayIndex("2026-12-20"), 5);
  assert.equal(cal.monthOf("2026-12-15"), "2026-11");
  assert.equal(cal.monthOf("2026-12-16"), "2026-12");
}
{
  const cal = monthCalendar({ enabled: true, periods: P }, "2027-01-05");
  assert.equal(cal.current, "2027-01");
  assert.equal(cal.first("2027-01"), "2027-01-01");
  assert.equal(cal.last("2027-01"), "2027-01-31");
  assert.equal(cal.dayIndex("2027-01-05"), 5);
}

/* ---------- 5. expectedLastDay ---------- */

assert.equal(expectedLastDay("2026-10-31"), "2026-11-29");
assert.equal(expectedLastDay("2026-12-03"), "2027-01-02");
assert.equal(expectedLastDay("2027-01-31"), "2027-02-27");
assert.equal(expectedLastDay("2028-01-31"), "2028-02-28");
assert.equal(expectedLastDay("2026-11-01"), "2026-11-30");

/* ---------- 6. Payday drifting across the 16th: "Dec" is skipped ---------- */

{
  const drift = [
    { month: "2026-11", start: "2026-10-16", end: "2026-12-15" },
    { month: "2027-01", start: "2026-12-16", end: "2027-02-15" },
  ];
  const cal = monthCalendar({ enabled: true, periods: drift }, "2027-01-05");
  assert.equal(cal.current, "2027-01");
  assert.equal(cal.monthOf("2026-12-10"), "2026-11");
  assert.equal(cal.monthOf("2026-12-20"), "2027-01");
  assert.equal(cal.first("2026-12"), "2026-12-01"); // nothing left: the calendar month's own bounds
  assert.equal(cal.last("2026-12"), "2026-12-31");
  assert.equal(cal.last("2027-01"), "2027-01-15"); // expected last day of 16 Dec
}

/* ---------- 7. First salary on 1–15 Nov: "Nov" starts on 1 Nov ---------- */

{
  const cal = monthCalendar({ enabled: true, periods: [{ month: "2026-11", start: "2026-11-01", end: "2026-12-15" }] }, "2026-11-05");
  assert.equal(cal.first("2026-11"), "2026-11-01");
  assert.equal(cal.last("2026-11"), "2026-11-30");
  assert.equal(cal.monthOf("2026-10-31"), "2026-10");
  assert.equal(cal.first("2026-10"), "2026-10-01");
  assert.equal(cal.last("2026-10"), "2026-10-31");
}

/* ---------- 8. calendarCellsBetween ---------- */

{
  const cells = calendarCellsBetween("2026-10-31", "2026-11-29"); // 31 Oct 2026 is a Saturday
  assert.deepEqual(cells.slice(0, 5), [null, null, null, null, null]);
  assert.equal(cells[5], "2026-10-31");
  assert.equal(cells[6], "2026-11-01");
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.filter(Boolean).length, 30);
  assert.equal(cells.filter(Boolean).at(-1), "2026-11-29");
  assert.deepEqual(calendarCells("2026-10"), calendarCellsBetween("2026-10-01", "2026-10-31"));
  assert.deepEqual(calendarCells("2028-02"), calendarCellsBetween("2028-02-01", "2028-02-29"));
  // Across a year end.
  const year = calendarCellsBetween("2026-12-31", "2027-01-02").filter(Boolean);
  assert.deepEqual(year, ["2026-12-31", "2027-01-01", "2027-01-02"]);
}

/* ---------- 9. periodLabel ---------- */

assert.equal(periodLabel("2026-11", "2026-10-31", null), "Nov · 31 Oct – today");
assert.equal(periodLabel("2026-11", "2026-10-31", "2026-11-29"), "Nov · 31 Oct – 29 Nov");
// en-IN prints "Sept"; compare with whatever this ICU build prints.
assert.equal(periodLabel("2026-10", "2026-09-30", "2026-10-30"), `Oct · ${shortDayLabel("2026-09-30")} – 30 Oct`);
assert.equal(periodLabel("2025-11", "2025-10-31", "2025-12-02", true), "Nov 2025 · 31 Oct – 2 Dec");

console.log("check-periods: ok");
