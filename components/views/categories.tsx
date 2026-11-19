"use client";

import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";

import {
  CATEGORY_NAMES,
  CUSTOM_ICONS,
  CUSTOM_MAX,
  CUSTOM_NAME_MAX,
  PALETTE,
  RESERVED_NAMES,
  UNCATEGORIZED,
  categoryNames,
  type PaletteKey,
} from "@/lib/categories";
import { cameFromApp } from "@/lib/nav-history";
import type { CustomCategory } from "@/lib/types";

import { BackBar, BottomSheet, FAB, SHEET_BUTTON, SHEET_FIELD, SheetLabel } from "../bottom-sheet";
import { useData } from "../data-provider";
import { Card, CategoryTile, IconTile, cx } from "../ui";

export const CATEGORIES_PAGE = "/settings/categories";

/** The server's texts, also checked here first. */
const ERRORS = {
  name: "Enter a name.",
  nameLong: `Names can be up to ${CUSTOM_NAME_MAX} characters.`,
  nameChars: "Use letters, digits, spaces and & - ' . , ( ) /.",
  taken: "A category with this name already exists.",
  full: `You can have up to ${CUSTOM_MAX} categories.`,
  icon: "Pick an icon from the list.",
  colour: "Pick a colour from the list.",
} as const;

const NAME_CHARS = /^[\p{L}\p{M}\p{N} &\-'.,()/]+$/u;
const ICON_NAMES = Object.keys(CUSTOM_ICONS);
const COLOURS = Object.keys(PALETTE) as PaletteKey[];

/** "PawPrint" → "Paw print", for screen readers. */
const iconLabel = (key: string) => key.replace(/(?<=[a-z])(?=[A-Z])/g, " ").replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Open = { kind: "add" } | { kind: "edit"; id: string };

/**
 * Settings → Categories: your own spending categories (tap to change the icon or colour, or delete) and the
 * built-in ones, read-only. + adds one (up to 30).
 */
export function CategoriesView() {
  const { customCategories } = useData();
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const full = customCategories.length >= CUSTOM_MAX;
  const editing = open?.kind === "edit" ? (customCategories.find((c) => c.id === open.id) ?? null) : null;

  const back = () => {
    if (cameFromApp()) router.back();
    else router.replace("/settings");
  };

  // The deleted category's row (where the sheet would put focus back) is gone, so focus goes to the notice
  // when it shows (noticeShown), not to <body>.
  const focusNoticeNext = useRef(false);
  const noticeShown = useCallback((node: HTMLParagraphElement | null) => {
    if (node && focusNoticeNext.current) {
      focusNoticeNext.current = false;
      node.focus();
    }
  }, []);
  const deleted = useCallback((moved: number, to: string) => {
    focusNoticeNext.current = true;
    setOpen(null);
    setNotice(`Moved ${plural(moved, "payment", "payments")} to ${to}.`);
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-6 lg:px-8 lg:pb-12">
      <BackBar onBack={back} />

      <h1 className="pt-2 text-[28px] font-bold tracking-tight text-ink lg:text-3xl">Categories</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        Add your own spending categories, like Pets or Gym. Folio&apos;s AI never picks them: new payments get them
        from your edits (Folio remembers the merchant) and from your rules.
      </p>

      <div role="status">
        {notice ? (
          <p
            ref={noticeShown}
            tabIndex={-1}
            className="mt-4 flex items-center gap-1.5 rounded-card bg-income-soft px-4 py-3 text-[13px] font-medium text-income outline-none"
          >
            <Check size={15} className="shrink-0" aria-hidden /> {notice}
          </p>
        ) : null}
      </div>

      <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">
        Yours ({customCategories.length} of {CUSTOM_MAX})
      </h2>
      {customCategories.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {customCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setNotice(null);
                setOpen({ kind: "edit", id: c.id });
              }}
              aria-label={`Edit ${c.name}`}
              className="flex min-h-16 w-full min-w-0 items-center gap-3.5 px-4 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
            >
              <CategoryTile name={c.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{c.name}</span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
            </button>
          ))}
        </Card>
      ) : (
        <div className="rounded-card border border-dashed border-line px-4 py-6 text-center">
          <p className="text-[15px] font-medium text-ink">None yet</p>
          <p className="mt-1 text-[13px] text-ink-2">Tap + to add one. It counts as spending, and can have a limit.</p>
        </div>
      )}

      <h2 className="mt-6 mb-2 px-1 text-[15px] text-ink-2">Built in</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {[...CATEGORY_NAMES, UNCATEGORIZED].map((name) => (
          <div key={name} className="flex min-h-14 min-w-0 items-center gap-3.5 px-4 py-2.5">
            <CategoryTile name={name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{name}</span>
          </div>
        ))}
      </Card>

      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setOpen({ kind: "add" });
        }}
        disabled={full}
        aria-label={full ? `Add category (you have ${CUSTOM_MAX})` : "Add category"}
        title="Add category"
        className={FAB}
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {open?.kind === "add" ? <CategorySheet key="add" category={null} onClose={close} onDeleted={deleted} /> : null}
      {editing ? <CategorySheet key={editing.id} category={editing} onClose={close} onDeleted={deleted} /> : null}
    </div>
  );
}

/** Add a category (name, icon, colour), or change one's icon and colour, or delete it (moving its payments). */
function CategorySheet({
  category,
  onClose,
  onDeleted,
}: {
  category: CustomCategory | null;
  onClose: () => void;
  onDeleted: (moved: number, to: string) => void;
}) {
  const { customCategories, txns, addCategory, updateCategory, deleteCategory } = useData();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(category?.icon ?? "Tag");
  const [colour, setColour] = useState(category?.colour ?? "violet");
  const [removing, setRemoving] = useState(false); // the delete step
  const [moveTo, setMoveTo] = useState(UNCATEGORIZED);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownName = category?.name ?? (name.trim() || "New category");
  const payments = category ? txns.filter((t) => t.category === category.name).length : 0;

  // Same checks and texts as the server.
  const check = (clean: string) => {
    if (!clean) return ERRORS.name;
    if ([...clean].length > CUSTOM_NAME_MAX) return ERRORS.nameLong;
    if (!NAME_CHARS.test(clean)) return ERRORS.nameChars;
    const lower = clean.toLowerCase();
    if (RESERVED_NAMES.has(lower) || customCategories.some((c) => c.name.toLowerCase() === lower)) return ERRORS.taken;
    if (customCategories.length >= CUSTOM_MAX) return ERRORS.full;
    return "";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(icon in CUSTOM_ICONS)) return setError(ERRORS.icon);
    if (!(colour in PALETTE)) return setError(ERRORS.colour);
    setError(null);
    if (removing && category) {
      setSaving(true);
      try {
        const moved = await deleteCategory(category.id, moveTo);
        onDeleted(moved, moveTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete the category.");
        setSaving(false);
      }
      return;
    }
    const clean = name.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!category) {
      const problem = check(clean);
      if (problem) return setError(problem);
    }
    setSaving(true);
    try {
      if (category) await updateCategory(category.id, { icon, colour });
      else await addCategory({ name: clean, icon, colour });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the category.");
      setSaving(false);
    }
  };

  const Icon = CUSTOM_ICONS[icon] ?? CUSTOM_ICONS.Tag;
  const colourHex = (PALETTE as Record<string, string>)[colour] ?? PALETTE.gray;
  const targets = [...categoryNames(), UNCATEGORIZED].filter((n) => n !== category?.name);

  return (
    <BottomSheet
      id="category"
      title={removing ? `Delete ${category?.name ?? ""}` : category ? category.name : "New category"}
      onClose={onClose}
      initialFocus={category ? undefined : nameRef}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-3 text-[13px] font-medium text-expense">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            form="category-form"
            disabled={saving}
            className={removing ? SHEET_BUTTON.replace("bg-ink", "bg-expense").replace("text-canvas", "text-white") : SHEET_BUTTON}
          >
            {saving ? (removing ? "Deleting…" : "Saving…") : removing ? "Delete category" : category ? "Save" : "Add category"}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
        {removing && category ? (
          <>
            <p className="text-[14px] leading-relaxed text-ink-2">
              {payments
                ? `${plural(payments, "payment is", "payments are")} in ${category.name}.`
                : `No loaded payments are in ${category.name}.`}{" "}
              They move to the category you pick, and Folio remembers it for their merchants.
            </p>
            <div>
              <SheetLabel htmlFor="category-move">Move its payments to</SheetLabel>
              <div className="relative">
                <select
                  id="category-move"
                  value={moveTo}
                  onChange={(e) => {
                    setMoveTo(e.target.value);
                    setError(null);
                  }}
                  className={cx(SHEET_FIELD, "appearance-none truncate pr-10")}
                >
                  {targets.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-2" aria-hidden />
              </div>
            </div>
            <p className="text-[13px] text-ink-2">Its limit and rules that set it are deleted too.</p>
            <button
              type="button"
              onClick={() => {
                setRemoving(false);
                setError(null);
              }}
              disabled={saving}
              className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink disabled:opacity-50"
            >
              Keep it
            </button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-track px-4 py-3" aria-hidden>
              <IconTile icon={Icon} color={colourHex} size="sm" />
              <span className="min-w-0 truncate text-[15px] font-medium text-ink">{shownName}</span>
            </div>
            {category ? (
              <p className="text-[13px] text-ink-2">A category can&apos;t be renamed: add a new one, then delete this one and move its payments.</p>
            ) : (
              <div>
                <SheetLabel htmlFor="category-name">Name</SheetLabel>
                <input
                  ref={nameRef}
                  id="category-name"
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={CUSTOM_NAME_MAX}
                  placeholder="Pets"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  className={SHEET_FIELD}
                />
              </div>
            )}
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Icon</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {ICON_NAMES.map((key) => {
                  const Glyph = CUSTOM_ICONS[key];
                  const on = key === icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      aria-label={iconLabel(key)}
                      title={iconLabel(key)}
                      onClick={() => {
                        setIcon(key);
                        setError(null);
                      }}
                      className={cx(
                        "grid h-12 min-w-0 place-items-center rounded-2xl border transition focus-visible:outline-2 focus-visible:outline-violet",
                        on ? "border-violet bg-violet-soft text-violet-strong" : "border-line bg-surface text-ink-2 hover:text-ink",
                      )}
                    >
                      <Glyph size={20} strokeWidth={2.2} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="min-w-0 pb-1">
              <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Colour</legend>
              <div className="flex flex-wrap gap-2.5">
                {COLOURS.map((key) => {
                  const on = key === colour;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      aria-label={key}
                      title={key}
                      onClick={() => {
                        setColour(key);
                        setError(null);
                      }}
                      className={cx(
                        "grid size-10 shrink-0 place-items-center rounded-full text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet",
                        on && "ring-2 ring-ink ring-offset-2 ring-offset-canvas",
                      )}
                      style={{ backgroundColor: PALETTE[key] }}
                    >
                      {on ? <Check size={18} strokeWidth={3} aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {category ? (
              <button
                type="button"
                onClick={() => {
                  setRemoving(true);
                  setError(null);
                }}
                disabled={saving}
                className="h-10 rounded-full px-4 text-sm font-medium text-expense hover:bg-expense-soft disabled:opacity-50"
              >
                Delete category
              </button>
            ) : null}
          </>
        )}
      </form>
    </BottomSheet>
  );
}
