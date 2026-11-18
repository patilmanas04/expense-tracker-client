// Checks the tag rule, Activity links and the day-range labels with plain Node (no test framework):
//   node scripts/check-tags.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
// The tag examples are the same ones the server's goal tags are tested with.
import assert from "node:assert/strict";

import { dayRangeLabel, daySpan } from "../lib/format.ts";
import { activityRequestFromLink } from "../lib/links.ts";
import { allTags, insertTag, partialTagAt, suggestTags, tagQuery, tagsOf } from "../lib/tags.ts";

/* ---------- The tag rule ---------- */

const a30 = "a".repeat(30);
const tagCases = [
  ["#goa", ["goa"]],
  ["#Goa trip, #goa", ["goa"]],
  ["#दिल्ली", ["दिल्ली"]],
  ["(#goa)", ["goa"]],
  ["Order#12345", []],
  ["abc#goa", []],
  ["#2024", []],
  ["#2024-goa", ["2024-goa"]],
  [`#${"a".repeat(31)}`, []],
  [`#${a30}`, [a30]],
  [null, []],
  ["#a #b #a", ["a", "b"]],
  ["#goa#beach", ["goa"]],
  ["#ÉTÉ", ["été"]],
  ["#goa_trip-2", ["goa_trip-2"]],
  ["#café", ["café"]], // NFD in, NFC out
];
for (const [note, expected] of tagCases) assert.deepEqual(tagsOf(note), expected, `tagsOf(${JSON.stringify(note)})`);

assert.deepEqual(allTags([{ tags: ["goa"] }, { tags: ["goa", "beach"] }, { tags: ["aa"] }]), [
  { tag: "goa", count: 2 },
  { tag: "aa", count: 1 },
  { tag: "beach", count: 1 },
]);

/* ---------- Search, typing and suggestions ---------- */

assert.equal(tagQuery("#goa"), "goa");
assert.equal(tagQuery("  #Goa "), "goa");
assert.equal(tagQuery("#goa trip"), null);
assert.equal(tagQuery("goa"), null);
assert.equal(tagQuery("#goals"), "goals");
assert.equal(tagsOf("#goals").includes("goa"), false); // exact match, not a prefix

assert.deepEqual(partialTagAt("trip #g", 7), { start: 5, partial: "g" });
assert.deepEqual(partialTagAt("#", 1), { start: 0, partial: "" });
assert.equal(partialTagAt("abc#g", 5), null);
assert.equal(partialTagAt("#goa beach", 3), null); // caret in the middle of the tag
assert.deepEqual(partialTagAt("#G", 2), { start: 0, partial: "g" });
assert.equal(partialTagAt("no tag", 6), null);

const known = [
  { tag: "goa", count: 18 },
  { tag: "gym", count: 3 },
  { tag: "beach", count: 2 },
];
assert.deepEqual(suggestTags(known, "g"), known.slice(0, 2));
assert.deepEqual(suggestTags(known, "goa"), []);
assert.deepEqual(suggestTags(known, ""), known);
const many = Array.from({ length: 7 }, (_, i) => ({ tag: `a${i}`, count: 7 - i }));
assert.deepEqual(suggestTags(many, "a"), many.slice(0, 5));

assert.deepEqual(insertTag("trip #g", 5, 7, "goa"), { text: "trip #goa ", caret: 10 });
assert.deepEqual(insertTag("#g lunch", 0, 2, "goa"), { text: "#goa lunch", caret: 4 });

/* ---------- Links into Activity ---------- */

const linkCases = [
  ["/activity?kind=review", { kind: "REVIEW" }],
  ["/activity/?kind=Review", { kind: "REVIEW" }],
  ["/activity?tag=goa", { tag: "goa" }],
  ["/activity?tag=%23Goa", { tag: "goa" }],
  ["/activity?txn=abc-123", { txn: "abc-123" }],
  ["/activity?kind=review&tag=goa&utm=x", { kind: "REVIEW", tag: "goa" }],
  ["/activity", {}],
  ["/activity?kind=refund", { kind: "REFUND" }],
  ["/activity?kind=Refund&tag=goa", { kind: "REFUND", tag: "goa" }],
  ["/activity?kind=refunds", {}],
  ["/settings/limits", null],
  ["/settings#limits", null],
  ["/activityx?kind=review", null],
  ["https://example.com/activity?tag=goa", null],
];
for (const [link, expected] of linkCases) assert.deepEqual(activityRequestFromLink(link), expected, link);

/* ---------- Day ranges ---------- */

assert.equal(daySpan("2026-10-12", "2026-10-18"), 7);
assert.equal(daySpan("2026-10-12", "2026-10-12"), 1);
assert.equal(daySpan("2026-09-28", "2026-10-03"), 6);
assert.equal(dayRangeLabel("2026-10-12", "2026-10-18"), "12–18 Oct");
assert.equal(dayRangeLabel("2026-10-12", "2026-10-12"), "12 Oct");
assert.equal(dayRangeLabel("2026-09-28", "2026-10-03"), "28 Sept – 3 Oct");
assert.equal(dayRangeLabel("2025-12-28", "2026-01-03"), "28 Dec 2025 – 3 Jan 2026");

console.log("check-tags: ok");
