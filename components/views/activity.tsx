"use client";

import { Check, Plus, Search, SearchX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { counts, type Txn } from "@/lib/analytics";
import { categoryName } from "@/lib/categories";
import { formatMoney, monthLabel } from "@/lib/format";

import { AddTransactionSheet } from "../add-transaction";
import { useData, type KindFilter } from "../data-provider";
import { TransactionGroups } from "../transactions";
import { Card, SelectPill, cx } from "../ui";

const PAGE = 50;
const ALL = "ALL";

export function ActivityView() {
  const { txns, months, currency, activityRequest } = useData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [category, setCategory] = useState(ALL);
  const [period, setPeriod] = useState(ALL);
  const [visible, setVisible] = useState(PAGE);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Txn | null>(null);
  // Stable, so a live update re-rendering this page doesn't reset focus inside the open sheet.
  const closeAdd = useCallback(() => setAdding(false), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Another screen asked for a filtered view (e.g. a category card or the review bell).
  if (activityRequest && activityRequest.nonce !== appliedNonce) {
    setAppliedNonce(activityRequest.nonce);
    if (activityRequest.kind || activityRequest.category || activityRequest.month) {
      setKind(activityRequest.kind ?? "ALL");
      setCategory(activityRequest.category ?? ALL);
      setPeriod(activityRequest.month ?? ALL);
      setQuery("");
    }
    setVisible(PAGE);
  }

  useEffect(() => {
    if (activityRequest?.focusSearch) searchRef.current?.focus();
  }, [activityRequest]);

  const searchable = useMemo(
    () =>
      new Map(
        txns.map((t) => [
          t.id,
          [t.merchant, categoryName(t), t.account_ref, t.reference_id, t.sender, t.raw_message, t.amount.toFixed(2)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        ]),
      ),
    [txns],
  );

  const categoryOptions = useMemo(
    () => [...new Set(txns.filter((t) => t.is_parsed).map(categoryName))].sort((a, b) => a.localeCompare(b)),
    [txns],
  );

  const reviewCount = useMemo(() => txns.filter((t) => !t.is_parsed).length, [txns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter(
      (t) =>
        (period === ALL || t.month === period) &&
        (kind === "ALL" || (kind === "REVIEW" ? !t.is_parsed : t.is_parsed && t.type === kind)) &&
        (category === ALL || (t.is_parsed && categoryName(t) === category)) &&
        (!q || searchable.get(t.id)?.includes(q)),
    );
  }, [txns, query, kind, category, period, searchable]);

  // The confirmation under the header fades after a few seconds.
  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(null), 4000);
    return () => window.clearTimeout(id);
  }, [added]);

  const summary = useMemo(() => {
    let spent = 0;
    let received = 0;
    for (const t of filtered) {
      if (!counts(t, currency)) continue;
      if (t.type === "DEBIT") spent += t.minor;
      else received += t.minor;
    }
    return { spent, received };
  }, [filtered, currency]);

  // Render long histories progressively as the list scrolls.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible((v) => v + PAGE),
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length]);

  const resetFilters = () => {
    setQuery("");
    setKind("ALL");
    setCategory(ALL);
    setPeriod(ALL);
  };
  const filtersActive = query || kind !== "ALL" || category !== ALL || period !== ALL;

  const onAdded = (txn: Txn) => {
    setAdded(txn);
    // Don't let the current filters hide what you just added.
    const visible =
      (period === ALL || txn.month === period) &&
      (kind === "ALL" || kind === txn.type) &&
      (category === ALL || categoryName(txn) === category) &&
      !query.trim();
    if (!visible) resetFilters();
    setVisible(PAGE);
  };

  const chips: { value: KindFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "DEBIT", label: "Expenses" },
    { value: "CREDIT", label: "Income" },
    { value: "REVIEW", label: "Needs review" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-safe sm:px-6 lg:px-8 lg:pt-8">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink lg:text-3xl">Activity</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-2">
            {filtered.length} of {txns.length}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-haspopup="dialog"
            className="flex h-10 items-center gap-1.5 rounded-full bg-ink pr-4 pl-3 text-sm font-semibold text-canvas transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            <Plus size={18} strokeWidth={2.4} aria-hidden /> Add
          </button>
        </div>
      </header>

      {added ? (
        <p role="status" className="animate-fade mt-3 flex items-center gap-2 rounded-2xl bg-income-soft px-4 py-2.5 text-sm font-medium text-income">
          <Check size={16} aria-hidden />
          <span className="truncate">
            Added {added.merchant} · {formatMoney(added.type === "DEBIT" ? -added.minor : added.minor, added.currency, { signed: true })}
          </span>
        </p>
      ) : null}

      <div className="relative mt-4">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(PAGE);
          }}
          placeholder="Search transactions"
          aria-label="Search transactions"
          className="h-12 w-full rounded-full border border-line bg-surface pr-11 pl-11 text-[16px] text-ink shadow-card outline-none placeholder:text-ink-3 focus:border-violet/50 focus:ring-4 focus:ring-violet/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-track"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* Wraps inside the page padding instead of scrolling, so chips never meet the screen edge. */}
      <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            role="radio"
            aria-checked={kind === chip.value}
            onClick={() => {
              setKind(chip.value);
              setVisible(PAGE);
            }}
            className={cx(
              "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium transition",
              kind === chip.value ? "bg-ink text-canvas" : "border border-line bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {chip.label}
            {chip.value === "REVIEW" && reviewCount ? (
              <span className={cx("rounded-full px-1.5 text-[11px] leading-4", kind === "REVIEW" ? "bg-canvas/20" : "bg-warn-soft text-warn")}>
                {reviewCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <SelectPill
          size="sm"
          label="Period"
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setVisible(PAGE);
          }}
          options={[{ value: ALL, label: "All time" }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))]}
        />
        <SelectPill
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setVisible(PAGE);
          }}
          options={[{ value: ALL, label: "All categories" }, ...categoryOptions.map((c) => ({ value: c, label: c }))]}
          size="sm"
          className="max-w-full"
        />
        {filtersActive ? (
          <button type="button" onClick={resetFilters} className="h-8 rounded-full px-3 text-[13px] font-medium text-violet-strong hover:bg-violet-soft">
            Reset
          </button>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Card className="px-4 py-3">
            <p className="text-xs text-ink-2">Spent</p>
            <p className="mt-0.5 truncate text-lg font-semibold text-ink tabular-nums">{formatMoney(summary.spent, currency)}</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs text-ink-2">Received</p>
            <p className="mt-0.5 truncate text-lg font-semibold text-income tabular-nums">{formatMoney(summary.received, currency)}</p>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        {filtered.length === 0 ? (
          <Card className="flex flex-col items-center p-8 text-center">
            <SearchX size={28} className="text-ink-3" aria-hidden />
            <p className="mt-3 font-medium text-ink">
              {txns.length === 0 ? "No transactions yet" : kind === "REVIEW" ? "Nothing needs review" : "No matching transactions"}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {txns.length === 0
                ? "Bank SMS forwarded by your iPhone Shortcut will show up here. Paid in cash? Tap Add."
                : kind === "REVIEW"
                  ? "Every SMS so far was read successfully."
                  : "Try a different search or filter."}
            </p>
            {filtersActive && txns.length > 0 ? (
              <button type="button" onClick={resetFilters} className="mt-4 h-10 rounded-full bg-ink px-5 text-sm font-semibold text-canvas">
                Clear filters
              </button>
            ) : null}
          </Card>
        ) : (
          <>
            <TransactionGroups items={filtered.slice(0, visible)} />
            {visible < filtered.length ? <div ref={sentinelRef} className="h-10" aria-hidden /> : null}
          </>
        )}
      </div>

      {adding ? <AddTransactionSheet onClose={closeAdd} onAdded={onAdded} /> : null}
    </div>
  );
}
