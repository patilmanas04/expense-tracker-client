// Checks the lend & borrow helpers (equal shares, balance texts, settling up, names) with plain Node (no test framework):
//   node scripts/check-ledger.mjs
// Node strips the types from the .ts files; a MODULE_TYPELESS_PACKAGE_JSON warning is expected.
// lib/ledger.ts imports "./format" without an extension (as the app's bundler expects), so a resolve hook adds ".ts".
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

const { amountInput, balanceText, equalShares, kindLabel, owedBy, personError, personKey, settleEntry } = await import(
  "../lib/ledger.ts"
);

/* ---------- equalShares: people get the rounded-down part, you get the rest ---------- */

assert.deepEqual(equalShares(180000, 2), { shares: [60000, 60000], mine: 60000 }); // ₹1,800 with Rahul and Priya
assert.deepEqual(equalShares(100000, 2), { shares: [33333, 33333], mine: 33334 }); // ₹1,000: 333.33 each, you 333.34
assert.deepEqual(equalShares(1, 1), { shares: [0], mine: 1 }); // ₹0.01
assert.deepEqual(equalShares(100000, 0), { shares: [], mine: 100000 });
for (const [amount, people] of [[99999, 3], [123457, 7], [100, 19]]) {
  const { shares, mine } = equalShares(amount, people);
  assert.equal(shares.length, people);
  assert.equal(shares.reduce((a, b) => a + b, 0) + mine, amount);
  assert.ok(mine >= shares[0] && mine - shares[0] <= people);
}

/* ---------- Balance texts ---------- */

assert.equal(balanceText("Rahul", 60000), "Rahul owes you ₹600");
assert.equal(balanceText("Rahul", 160050), "Rahul owes you ₹1,600.50");
assert.equal(balanceText("Priya", -30000), "You owe Priya ₹300");
assert.equal(balanceText("Priya", -33333), "You owe Priya ₹333.33");
assert.equal(balanceText("Rahul", 0), "Settled");

/* ---------- Settle up: the entry that brings a balance to zero ---------- */

assert.deepEqual(settleEntry(60000), { kind: "repaid_to_me", amountMinor: 60000 });
assert.deepEqual(settleEntry(-30000), { kind: "repaid_by_me", amountMinor: 30000 });
assert.equal(settleEntry(0), null);

/* ---------- Names ---------- */

assert.equal(personKey("  Rahul  K "), "rahul k");
assert.equal(personKey("RAHUL"), "rahul");
assert.equal(personKey("rahul\t k"), "rahul k");
assert.equal(personError(""), "Enter a name.");
assert.equal(personError("R".repeat(60)), "");
assert.equal(personError("R".repeat(61)), "Names can be up to 60 characters.");
assert.equal(personError("Ra\u0007hul"), "Names can't contain invalid characters.");

assert.equal(kindLabel("lent", "Rahul"), "Lent to Rahul");
assert.equal(kindLabel("repaid_by_me", "Rahul"), "Repaid to Rahul");
assert.equal(kindLabel("borrowed", "Priya"), "Borrowed from Priya");
assert.equal(kindLabel("repaid_to_me", "Priya"), "Repayment from Priya");

/* ---------- owedBy: what one person owes you ---------- */

const ledger = {
  people: [
    { person: "Rahul", key: "rahul", balance: 600, entries: [] },
    { person: "Priya", key: "priya", balance: -300, entries: [] },
  ],
};
assert.equal(owedBy(ledger, " rahul "), 60000);
assert.equal(owedBy(ledger, "Priya"), 0);
assert.equal(owedBy(ledger, "Asha"), 0);
assert.equal(owedBy(null, "Rahul"), 0);

assert.equal(amountInput(60000), "600");
assert.equal(amountInput(33333), "333.33");
assert.equal(amountInput(5), "0.05");

console.log("check-ledger: ok");
