// Checks the CSV export's quoting, formula guard, file names and 24-hour times with plain Node (no test framework):
//   node scripts/check-csv.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
// lib/csv-format.ts and lib/format.ts have no imports Node can't load; lib/csv.ts (lucide via categories) is
// checked by tsc and the browser.
import assert from "node:assert/strict";

import { amountCell, csvCell, fileName, slugPart, toCsv } from "../lib/csv-format.ts";
import { timeLabel24 } from "../lib/format.ts";

/* ---------- csvCell: plain values and RFC 4180 quoting ---------- */

assert.equal(csvCell("plain", true), "plain");
assert.equal(csvCell("a,b", true), '"a,b"');
assert.equal(csvCell('say "hi"', true), '"say ""hi"""');
assert.equal(csvCell("l1\nl2", true), '"l1\nl2"');
assert.equal(csvCell("l1\r\nl2", true), '"l1\r\nl2"');
assert.equal(csvCell("₹500", true), "₹500");
assert.equal(csvCell("", true), "");

/* ---------- Formula guard on text cells ---------- */

assert.equal(csvCell("=SUM(1)", true), "'=SUM(1)");
assert.equal(csvCell("+1", true), "'+1");
assert.equal(csvCell("-x", true), "'-x");
assert.equal(csvCell("@x", true), "'@x");
assert.equal(csvCell("\tx", true), "'\tx");
assert.equal(csvCell("\rx", true), "\"'\rx\"");
assert.equal(csvCell("=a,b", true), "\"'=a,b\"");
assert.equal(csvCell("a=b", true), "a=b");

/* ---------- No guard when text=false ---------- */

assert.equal(csvCell("-5.00", false), "-5.00");
assert.equal(csvCell("=1", false), "=1");
assert.equal(csvCell("2026-10-12", false), "2026-10-12");

/* ---------- toCsv ---------- */

const header = ["Date", "Amount", "Merchant"].map((value) => ({ value, text: true }));
const rows = [
  header,
  [
    { value: "2026-10-12", text: false },
    { value: "-5.00", text: false },
    { value: "-x", text: true },
  ],
  [
    { value: "2026-10-11", text: false },
    { value: "1234.50", text: false },
    { value: 'Cafe, "Goa"', text: true },
  ],
];
const out = toCsv(rows);
assert.equal(
  out,
  "﻿Date,Amount,Merchant\r\n2026-10-12,-5.00,'-x\r\n2026-10-11,1234.50,\"Cafe, \"\"Goa\"\"\"\r\n",
);
assert.ok(out.startsWith("﻿"));
assert.deepEqual([...Buffer.from(out).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
assert.equal(out.split("\r\n").length - 1, rows.length);
assert.ok(out.includes(",-5.00,'-x\r\n"), "Amount unprefixed, Merchant prefixed in the same row");
assert.equal(toCsv([]), "﻿");

/* ---------- amountCell ---------- */

assert.equal(amountCell(0), "0.00");
assert.equal(amountCell(5), "0.05");
assert.equal(amountCell(123450), "1234.50");
assert.equal(amountCell(-2500), "25.00");
assert.equal(amountCell(100000000), "1000000.00");

/* ---------- slugPart ---------- */

assert.equal(slugPart("Food & Dining"), "food-dining");
assert.equal(slugPart("दिल्ली"), "दिल्ली");
assert.equal(slugPart(" ÉTÉ_2024 "), "été-2024");
assert.equal(slugPart("#goa"), "goa");
assert.equal(slugPart("---"), "");

/* ---------- fileName ---------- */

const today = "2026-11-18";
const name = (filters) => fileName({ period: null, category: null, tags: [], kind: "ALL", ...filters }, today);

assert.equal(name({}), "folio-2026-11-18.csv");
assert.equal(name({ period: { month: "2026-10" }, category: "Travel" }), "folio-2026-10-travel-2026-11-18.csv");
assert.equal(
  name({ period: { month: "2026-10" }, category: "Travel & Commute" }),
  "folio-2026-10-travel-commute-2026-11-18.csv",
);
assert.equal(name({ period: { day: "2026-10-12" } }), "folio-2026-10-12-2026-11-18.csv");
assert.equal(
  name({ period: { from: "2026-10-01", to: "2026-10-15" } }),
  "folio-2026-10-01-to-2026-10-15-2026-11-18.csv",
);
assert.equal(name({ period: { from: "2026-10-12", to: "2026-10-12" } }), "folio-2026-10-12-2026-11-18.csv");
assert.equal(name({ period: { from: "2026-10-01" } }), "folio-from-2026-10-01-2026-11-18.csv");
assert.equal(name({ period: { to: "2026-10-15" } }), "folio-until-2026-10-15-2026-11-18.csv");
assert.equal(name({ period: {} }), "folio-2026-11-18.csv");
assert.equal(name({ kind: "REVIEW" }), "folio-review-2026-11-18.csv");
assert.equal(name({ kind: "DEBIT" }), "folio-debits-2026-11-18.csv");
assert.equal(name({ kind: "CREDIT" }), "folio-credits-2026-11-18.csv");
assert.equal(
  name({ period: { month: "2026-10" }, category: "Food & Dining", tags: ["goa"], kind: "DEBIT" }),
  "folio-2026-10-food-dining-goa-debits-2026-11-18.csv",
);
assert.equal(name({ tags: ["दिल्ली"] }), "folio-दिल्ली-2026-11-18.csv");
assert.equal(name({ category: "---" }), "folio-2026-11-18.csv");

const longStem = name({ category: "a".repeat(100) }).slice(0, -"-2026-11-18.csv".length);
assert.equal(Array.from(longStem).length, 80);
assert.equal(longStem, `folio-${"a".repeat(74)}`);
assert.equal(name({ category: `${"a".repeat(73)} b` }), `folio-${"a".repeat(73)}-2026-11-18.csv`);
assert.equal(name({ category: "𝔘".repeat(100) }), `folio-${"𝔘".repeat(74)}-2026-11-18.csv`);

/* ---------- timeLabel24 (IST) ---------- */

assert.equal(timeLabel24("2026-10-12T18:35:00Z"), "00:05");
assert.equal(timeLabel24("2026-10-12T08:05:00Z"), "13:35");
assert.equal(timeLabel24("2026-10-12T06:30:00Z"), "12:00");
assert.equal(timeLabel24("2026-10-12T18:29:00Z"), "23:59");

console.log("check-csv: ok");
