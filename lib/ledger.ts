/*
 * Lend & borrow: splits, loans and repayments with people. Pure helpers; the sums live on the server.
 *
 * Runtime imports only ./format: scripts/check-ledger.mjs imports this file with Node.
 */
import { formatMoney } from "./format";
import type { Ledger, LedgerKind } from "./types";

/** +1: money went to them (they owe you more); −1: money came from them. Matches ledger.py. */
export const LEDGER_SIGN: Record<LedgerKind, 1 | -1> = { lent: 1, repaid_by_me: 1, borrowed: -1, repaid_to_me: -1 };

/** Kinds a payment (debit) can carry. */
export const DEBIT_KINDS: readonly LedgerKind[] = ["lent", "repaid_by_me"];
/** Kinds money received (a credit) can carry. */
export const CREDIT_KINDS: readonly LedgerKind[] = ["repaid_to_me", "borrowed"];

/** Most entries on one payment (server: "Up to 20 entries per payment."). */
export const MAX_ENTRIES = 20;
/** Longest name, in characters. */
export const PERSON_MAX = 60;
/** Longest note, in characters. */
export const NOTE_MAX = 200;

/** The server's texts, also checked here first. */
export const LEDGER_ERRORS = {
  name: "Enter a name.",
  nameLong: `Names can be up to ${PERSON_MAX} characters.`,
  nameChars: "Names can't contain invalid characters.",
  amount: "Enter an amount above zero.",
  note: `Notes can be up to ${NOTE_MAX} characters.`,
  future: "The date can't be in the future.",
  entries: `Up to ${MAX_ENTRIES} entries per payment.`,
  over: "Shares add up to more than the payment.",
} as const;

/**
 * Equal shares of a payment between you and `people` others: each of them gets the amount ÷ (people + 1)
 * rounded down to the paisa, and your own share takes what's left (₹1,000 with 2 people: 333.33 each, yours
 * 333.34). Minor units.
 */
export function equalShares(amountMinor: number, people: number): { shares: number[]; mine: number } {
  const each = Math.floor(amountMinor / (people + 1));
  return { shares: Array.from({ length: people }, () => each), mine: amountMinor - each * people };
}

/** Who's the same person: trimmed, runs of spaces as one, lower case ("  Rahul  K " → "rahul k"). */
export const personKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** "₹600", "₹333.33": paise only when there are some. */
export const ledgerMoney = (minor: number) => formatMoney(minor, "INR", { decimals: minor % 100 !== 0 });

/** Minor units as an amount field's text: "600", "333.33". */
export const amountInput = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

/** "Rahul owes you ₹600", "You owe Priya ₹300", or "Settled". */
export function balanceText(person: string, balanceMinor: number): string {
  if (balanceMinor > 0) return `${person} owes you ${ledgerMoney(balanceMinor)}`;
  if (balanceMinor < 0) return `You owe ${person} ${ledgerMoney(-balanceMinor)}`;
  return "Settled";
}

/** The cash entry that brings a balance to zero; null when it's already settled. */
export function settleEntry(balanceMinor: number): { kind: LedgerKind; amountMinor: number } | null {
  if (balanceMinor === 0) return null;
  return balanceMinor > 0 ? { kind: "repaid_to_me", amountMinor: balanceMinor } : { kind: "repaid_by_me", amountMinor: -balanceMinor };
}

/** "Lent to Rahul", "Repaid to Rahul", "Borrowed from Rahul", "Repayment from Rahul". */
export function kindLabel(kind: LedgerKind, person: string): string {
  switch (kind) {
    case "lent":
      return `Lent to ${person}`;
    case "repaid_by_me":
      return `Repaid to ${person}`;
    case "borrowed":
      return `Borrowed from ${person}`;
    case "repaid_to_me":
      return `Repayment from ${person}`;
  }
}

/** What `name` owes you, in minor units: their balance when positive, else 0. */
export function owedBy(ledger: Ledger | null, name: string): number {
  const key = personKey(name);
  if (!ledger || !key) return 0;
  const person = ledger.people.find((p) => p.key === key || personKey(p.person) === key);
  return person ? Math.max(0, Math.round(person.balance * 100)) : 0;
}

/** The server's name check: "" when the name is fine. Expects the name trimmed. */
export function personError(name: string): string {
  if (/\p{Cc}/u.test(name)) return LEDGER_ERRORS.nameChars;
  if (!name) return LEDGER_ERRORS.name;
  if ([...name].length > PERSON_MAX) return LEDGER_ERRORS.nameLong;
  return "";
}
