/*
 * Savings goals: progress toward a target from money added by hand plus the payments tagged for it.
 * Pure; the server only stores goals.
 *
 * Runtime imports only ./format and ./tags: scripts/check-goals.mjs imports this file with Node.
 */
import { toMinor } from "./format";
import { TAG_MAX } from "./tags";
import type { Txn } from "./analytics";
import type { Goal, GoalInput } from "./types";

/** Longest goal name, in characters. */
export const GOAL_NAME_MAX = 60;
/** Months ahead the target month picker offers. */
export const TARGET_MONTHS_AHEAD = 60;

/** The server's texts, also checked here first. */
export const GOAL_ERRORS = {
  name: "Enter a name.",
  nameLong: `Names can be up to ${GOAL_NAME_MAX} characters.`,
  nameChars: "Names can't contain invalid characters.",
  target: "Enter a target above zero.",
  month: "Pick a month like 2027-03.",
  saved: "Saved so far can't be below zero.",
  tag: "Enter a tag.",
  tagChars: "Tags use letters, digits, _ and -.",
  tagLong: `Tags can be up to ${TAG_MAX} characters.`,
  tagLetter: "A tag needs at least one letter.",
} as const;

type Counted = Pick<Txn, "is_parsed" | "type" | "currency" | "tags" | "counted" | "duplicate_of">;

/**
 * Money toward a goal, in minor units: added by hand, plus what counts of every parsed rupee payment (debit)
 * tagged with the goal's tag, from any date (a split payment adds only your share). Credits, other currencies,
 * unreadable SMS and possible duplicates you haven't decided on don't count. `count` is how many payments.
 */
export function goalProgress(goal: Pick<Goal, "tag" | "manual_saved">, txns: readonly Counted[]): { minor: number; count: number } {
  let minor = toMinor(goal.manual_saved);
  let count = 0;
  if (!goal.tag) return { minor, count };
  for (const t of txns) {
    if (!t.is_parsed || t.type !== "DEBIT" || t.currency !== "INR" || t.duplicate_of != null || !t.tags.includes(goal.tag)) continue;
    minor += t.counted;
    count += 1;
  }
  return { minor, count };
}

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

/** Months after `current` up to and including `target` (November → March is 4), at least 1; null once it's past. */
export function monthsLeft(target: string, current: string): number | null {
  const diff = monthIndex(target) - monthIndex(current);
  return diff < 0 ? null : Math.max(1, diff);
}

/** What to put aside each month, rounded up to whole rupees. */
export const perMonth = (remainingMinor: number, months: number) => Math.ceil(remainingMinor / months / 100) * 100;

const TAG_CHARS = /[\p{L}\p{M}\p{N}_-]/u;
const LETTER = /\p{L}/u;

/** A goal's tag from its name: the last word, lower case, only tag characters ("New phone" → "phone"); "" without a letter. */
export function defaultTag(name: string): string {
  const words = name.normalize("NFC").trim().split(/\s+/);
  const word = [...(words[words.length - 1] ?? "").toLowerCase()].filter((c) => TAG_CHARS.test(c)).slice(0, TAG_MAX).join("");
  return LETTER.test(word) ? word : "";
}

/** A typed tag as the server stores it: trimmed, one leading "#" dropped, NFC, lower case. */
export const normaliseTag = (text: string) => text.trim().replace(/^#/, "").normalize("NFC").toLowerCase();

/** The server's tag check on a normalised tag: "" when it's fine. */
export function tagError(tag: string): string {
  if (!tag) return GOAL_ERRORS.tag;
  const chars = [...tag];
  if (!chars.every((c) => TAG_CHARS.test(c))) return GOAL_ERRORS.tagChars;
  if (chars.length > TAG_MAX) return GOAL_ERRORS.tagLong;
  if (!LETTER.test(tag)) return GOAL_ERRORS.tagLetter;
  return "";
}

/** The server's name check on a trimmed name: "" when it's fine. */
export function goalNameError(name: string): string {
  if (/\p{Cc}/u.test(name)) return GOAL_ERRORS.nameChars;
  if (!name) return GOAL_ERRORS.name;
  if ([...name].length > GOAL_NAME_MAX) return GOAL_ERRORS.nameLong;
  return "";
}

export type GoalStatus =
  | { kind: "reached" }
  | { kind: "passed"; leftMinor: number }
  | { kind: "plan"; perMonthMinor: number; months: number }
  | { kind: "open"; leftMinor: number };

/** Where a goal stands this month (`currentMonth` "YYYY-MM"). */
export function goalStatus(goal: Pick<Goal, "target" | "target_month">, progressMinor: number, currentMonth: string): GoalStatus {
  const leftMinor = toMinor(goal.target) - progressMinor;
  if (leftMinor <= 0) return { kind: "reached" };
  if (!goal.target_month) return { kind: "open", leftMinor };
  const months = monthsLeft(goal.target_month, currentMonth);
  if (months === null) return { kind: "passed", leftMinor };
  return { kind: "plan", perMonthMinor: perMonth(leftMinor, months), months };
}

/** Minor units as a decimal string for the API: "60000", "250.50". */
export const decimalText = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

/** A saved goal as the body that replaces it, with `changes` applied. */
export const goalInput = (goal: Goal, changes: Partial<GoalInput> = {}): GoalInput => ({
  name: goal.name,
  target: decimalText(toMinor(goal.target)),
  target_month: goal.target_month,
  tag: goal.tag,
  manual_saved: decimalText(toMinor(goal.manual_saved)),
  archived: goal.archived,
  ...changes,
});

/** The server's order: active goals oldest first, then archived ones (oldest first). */
export const sortGoals = (goals: Goal[]) =>
  [...goals].sort((a, b) => Number(a.archived) - Number(b.archived) || Date.parse(a.created_at) - Date.parse(b.created_at));
