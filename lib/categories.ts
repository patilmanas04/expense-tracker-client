import {
  ArrowLeftRight,
  Banknote,
  BriefcaseBusiness,
  CarFront,
  ChartLine,
  CircleHelp,
  Clapperboard,
  CreditCard,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Landmark,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Undo2,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
  Transfer: { color: PALETTE.slate, icon: ArrowLeftRight },
};

/** Every category, in the same order as the backend's list. */
export const CATEGORY_NAMES = Object.keys(META);

/** The overall spending limit, across every category (`ALL` in the backend's limits.py). */
export const ALL_SPENDING = "All";

/** Categories that can have a spending limit; money-in categories can't (matches limits.py). */
export const LIMIT_CATEGORIES = CATEGORY_NAMES.filter((name) => !["Salary", "Income", "Refunds & Cashback"].includes(name));

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

export const categoryName = (t: { category: string | null }) => t.category || UNCATEGORIZED;

export const categoryMeta = (name: string): CategoryMeta => META[name] ?? FALLBACK;

/** `#8458F5` + alpha -> `#8458F51F` for soft icon tiles and progress tracks. */
export const tint = (hex: string, alpha = 0.12) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
