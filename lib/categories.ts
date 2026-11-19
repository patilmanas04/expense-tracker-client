import {
  ArrowDownUp,
  ArrowLeftRight,
  Baby,
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  CarFront,
  ChartLine,
  CircleHelp,
  Clapperboard,
  Coffee,
  CreditCard,
  Dumbbell,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  Plane,
  Shirt,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Tag,
  Undo2,
  Utensils,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { CustomCategory } from "./types";

/**
 * Categorical hues from the reference, re-stepped so every pair stays apart for
 * colour-blind readers (validated with the dataviz palette checker). Colour follows
 * the category, never its rank, so a category keeps its colour across months.
 */
export const PALETTE = {
  violet: "#8458F5",
  blue: "#38B6FF",
  green: "#22B566",
  orange: "#FF7A00",
  pink: "#E8559B",
  amber: "#EDA100",
  teal: "#0F9E9E",
  red: "#E34948",
  slate: "#64748B",
  gray: "#A1A1AA",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Icons a category of your own can have (the server checks the same 12 names). */
export const CUSTOM_ICONS: Record<string, LucideIcon> = {
  PawPrint,
  Dumbbell,
  Gift,
  Baby,
  House,
  Plane,
  Coffee,
  Shirt,
  Wrench,
  BookOpen,
  Tag,
  Sparkles,
};

export const UNCATEGORIZED = "Uncategorized";
export const OTHER = "Other";

export interface CategoryMeta {
  color: string;
  icon: LucideIcon;
}

// Names match `CATEGORIES` in expense-tracker-server/parser.py.
const META: Record<string, CategoryMeta> = {
  "Food & Dining": { color: PALETTE.orange, icon: Utensils },
  Groceries: { color: PALETTE.green, icon: ShoppingBasket },
  Shopping: { color: PALETTE.violet, icon: ShoppingBag },
  "Travel & Commute": { color: PALETTE.blue, icon: CarFront },
  "Bills & Utilities": { color: PALETTE.amber, icon: Zap },
  Entertainment: { color: PALETTE.pink, icon: Clapperboard },
  "Investments & Finance": { color: PALETTE.teal, icon: ChartLine },
  "Health & Fitness": { color: PALETTE.red, icon: HeartPulse },
  Education: { color: PALETTE.violet, icon: GraduationCap },
  Insurance: { color: PALETTE.teal, icon: ShieldCheck },
  "EMI & Loans": { color: PALETTE.red, icon: Landmark },
  "Credit Card Payment": { color: PALETTE.slate, icon: CreditCard },
  "Cash Withdrawal": { color: PALETTE.slate, icon: Banknote },
  Salary: { color: PALETTE.green, icon: BriefcaseBusiness },
  Income: { color: PALETTE.teal, icon: HandCoins },
  "Refunds & Cashback": { color: PALETTE.blue, icon: Undo2 },
  "Self Transfer": { color: PALETTE.slate, icon: ArrowDownUp },
  Transfer: { color: PALETTE.slate, icon: ArrowLeftRight },
};

/** Every category, in the same order as the backend's list. */
export const CATEGORY_NAMES = Object.keys(META);

/** Card bill payments and transfers between your own accounts: neither spending nor income.
 * Matches spending.py; tests/test_spending.py compares them. */
export const NOT_COUNTED: ReadonlySet<string> = new Set(["Credit Card Payment", "Self Transfer"]);

/** Money put into investments and deposits: not spending, shown as "Invested"; money back isn't income.
 * Matches spending.py; tests/test_spending.py compares them. */
export const INVESTED: ReadonlySet<string> = new Set(["Investments & Finance"]);

/** The overall spending limit, across every category (`ALL` in the backend's limits.py). */
export const ALL_SPENDING = "All";

/** Categories that can have a spending limit: not money in, and not categories that aren't spending (matches limits.py). */
export const LIMIT_CATEGORIES = CATEGORY_NAMES.filter(
  (name) => !["Salary", "Income", "Refunds & Cashback"].includes(name) && !NOT_COUNTED.has(name) && !INVESTED.has(name),
);

/** Monthly pay. Paid on or after this day of the month, it counts toward the next month's income
 * (it's the money for that month), so it's assigned to whichever month holds most of the month
 * after it arrives. Other money in ("Income") counts on the day it arrives. */
export const SALARY = "Salary";
export const SALARY_NEXT_MONTH_FROM = 16;

/** `account_ref` of a transaction added by hand and paid in cash (matches balance.py). */
export const CASH_ACCOUNT = "Cash";

/** `parsed_by` of a transaction added by hand. */
export const MANUAL = "manual";

const FALLBACK: CategoryMeta = { color: PALETTE.gray, icon: CircleHelp };

/** Most categories of your own (server: "You can have up to 30 categories."). */
export const CUSTOM_MAX = 30;
/** Longest name of your own, in characters. */
export const CUSTOM_NAME_MAX = 40;

/** Names a category of your own can't have, in any case: the built-ins, Uncategorized, "All" and "Other". */
export const RESERVED_NAMES: ReadonlySet<string> = new Set(
  [...CATEGORY_NAMES, UNCATEGORIZED, ALL_SPENDING, OTHER].map((name) => name.toLowerCase()),
);

// Categories of your own, as last loaded; the data provider registers them before rendering with them.
let custom: CustomCategory[] = [];
let customMeta = new Map<string, CategoryMeta>();

/** Replaces the categories of your own every lookup below knows about. */
export function registerCustomCategories(list: CustomCategory[]) {
  custom = [...list];
  customMeta = new Map(
    list.map((c) => [
      c.name,
      { icon: CUSTOM_ICONS[c.icon] ?? Tag, color: (PALETTE as Record<string, string>)[c.colour] ?? PALETTE.gray },
    ]),
  );
}

/** Categories of your own, oldest first. */
export const customCategories = (): readonly CustomCategory[] => custom;

export const categoryName = (t: { category: string | null }) => t.category || UNCATEGORIZED;

/** Built-in look, then a category of your own (its icon and colour), then the grey "?". */
export const categoryMeta = (name: string): CategoryMeta => META[name] ?? customMeta.get(name) ?? FALLBACK;

/** Every category to pick from: the built-ins in the backend's order, then yours. */
export const categoryNames = (): string[] => [...CATEGORY_NAMES, ...custom.map((c) => c.name)];

/** Categories that can have a spending limit: the built-in spending ones, then yours (all spending categories). */
export const limitCategories = (): string[] => [...LIMIT_CATEGORIES, ...custom.map((c) => c.name)];

/** `#8458F5` + alpha -> `#8458F51F` for soft icon tiles and progress tracks. */
export const tint = (hex: string, alpha = 0.12) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
