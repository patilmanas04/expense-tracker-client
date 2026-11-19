// Checks savings-goal progress, months left, the monthly amount, statuses and default tags with plain Node:
//   node scripts/check-goals.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
// lib/goals.ts imports "./format" and "./tags" without an extension (as the app's bundler expects), so a resolve
// hook adds ".ts".
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

const { defaultTag, goalInput, goalProgress, goalStatus, monthsLeft, normaliseTag, perMonth, sortGoals, tagError } =
  await import("../lib/goals.ts");

const txn = (over) => ({
  is_parsed: true,
  type: "DEBIT",
  currency: "INR",
  tags: ["phone"],
  minor: 1000000,
  counted: 1000000,
  duplicate_of: null,
  ...over,
});

/* ---------- CUJ 7: phone fund ---------- */

const phone = { id: "g1", name: "New phone", target: 60000, target_month: "2027-03", tag: "phone", manual_saved: 5000, archived: false, created_at: "2026-11-01T00:00:00Z" };
// Two ₹10,000 transfers to savings, categorised Self Transfer (not spending) but tagged #phone, and one other payment.
const txns = [txn({}), txn({}), txn({ tags: ["goa"], counted: 50000 })];
const progress = goalProgress(phone, txns);
assert.deepEqual(progress, { minor: 2500000, count: 2 }); // ₹25,000 from 2 payments
assert.equal(monthsLeft("2027-03", "2026-11"), 4);
assert.equal(perMonth(3500000, 4), 875000); // ₹8,750 a month
assert.deepEqual(goalStatus(phone, progress.minor, "2026-11"), { kind: "plan", perMonthMinor: 875000, months: 4 });

/* ---------- A split payment counts only what counts ---------- */

assert.deepEqual(goalProgress({ tag: "phone", manual_saved: 0 }, [txn({ minor: 180000, counted: 60000 })]), { minor: 60000, count: 1 });

/* ---------- Credits, other currencies, unread SMS and held-out duplicates don't count ---------- */

const ignored = [
  txn({ type: "CREDIT" }),
  txn({ currency: "USD" }),
  txn({ is_parsed: false }),
  txn({ duplicate_of: "x" }),
  txn({ tags: [] }),
];
assert.deepEqual(goalProgress({ tag: "phone", manual_saved: 0 }, ignored), { minor: 0, count: 0 });
assert.deepEqual(goalProgress({ tag: "", manual_saved: 12.5 }, txns), { minor: 1250, count: 0 });

/* ---------- Months left, the monthly amount ---------- */

assert.equal(monthsLeft("2026-11", "2026-11"), 1); // this month: all of it now
assert.equal(monthsLeft("2026-12", "2026-11"), 1);
assert.equal(monthsLeft("2027-11", "2026-11"), 12);
assert.equal(monthsLeft("2026-10", "2026-11"), null);
assert.equal(perMonth(100001, 3), 33400); // ₹333.34 rounds up to ₹334
assert.equal(perMonth(90000, 3), 30000);

/* ---------- Statuses ---------- */

assert.deepEqual(goalStatus({ ...phone, target_month: "2026-10" }, 2500000, "2026-11"), { kind: "passed", leftMinor: 3500000 });
assert.deepEqual(goalStatus(phone, 6000000, "2026-11"), { kind: "reached" });
assert.deepEqual(goalStatus(phone, 6500000, "2026-11"), { kind: "reached" });
assert.deepEqual(goalStatus({ ...phone, target_month: null }, 2500000, "2026-11"), { kind: "open", leftMinor: 3500000 });
assert.deepEqual(goalStatus({ ...phone, target_month: "2026-10" }, 6000000, "2026-11"), { kind: "reached" });

/* ---------- Tags ---------- */

assert.equal(defaultTag("New phone"), "phone");
assert.equal(defaultTag("Trip to दिल्ली"), "दिल्ली");
assert.equal(defaultTag("2027"), "");
assert.equal(defaultTag("Goa trip!"), "trip");
assert.equal(defaultTag("  Emergency  FUND "), "fund");
assert.equal(defaultTag(""), "");
assert.equal(defaultTag("x".repeat(40)), "x".repeat(30));

assert.equal(normaliseTag(" #Phone "), "phone");
assert.equal(normaliseTag("##phone"), "#phone");
assert.equal(tagError("phone"), "");
assert.equal(tagError(""), "Enter a tag.");
assert.equal(tagError("#phone"), "Tags use letters, digits, _ and -.");
assert.equal(tagError("new phone"), "Tags use letters, digits, _ and -.");
assert.equal(tagError("a".repeat(31)), "Tags can be up to 30 characters.");
assert.equal(tagError("2027"), "A tag needs at least one letter.");
assert.equal(tagError("दिल्ली"), "");

/* ---------- Bodies and order ---------- */

assert.deepEqual(goalInput(phone, { manual_saved: "35000" }), {
  name: "New phone",
  target: "60000",
  target_month: "2027-03",
  tag: "phone",
  manual_saved: "35000",
  archived: false,
});
const older = { ...phone, id: "g0", created_at: "2026-10-01T00:00:00Z" };
const archived = { ...phone, id: "g2", archived: true, created_at: "2026-09-01T00:00:00Z" };
assert.deepEqual(sortGoals([archived, phone, older]).map((g) => g.id), ["g0", "g1", "g2"]);

console.log("check-goals: ok");
