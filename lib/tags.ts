/*
 * Tags are #words in a transaction's note ("Dinner #goa"). The same rule is written in Python for
 * goal tags on the server; both test the same examples (scripts/check-tags.mjs).
 *
 * No imports: scripts/check-tags.mjs imports this file with Node.
 */

/** Longest tag, in characters (code points) after the "#". */
export const TAG_MAX = 30;

export interface TagCount {
  tag: string;
  count: number;
}

// "#" at the start or after anything that isn't a tag character or "#", then a run of letters
// (any language, with their combining marks), digits, "_" and "-".
const TAG_RE = /(?<![\p{L}\p{M}\p{N}_#-])#([\p{L}\p{M}\p{N}_-]+)/gu;
// The tag being typed just before the caret; it may be empty ("#" alone).
const PARTIAL_RE = /(?<![\p{L}\p{M}\p{N}_#-])#([\p{L}\p{M}\p{N}_-]{0,30})$/u;
const TAG_CHAR = /[\p{L}\p{M}\p{N}_-]/u;
const LETTER = /\p{L}/u;

const normalise = (text: string) => text.normalize("NFC").toLowerCase();

/** Tags in a note: normalised (NFC, lower case), unique, in order of first use. */
export function tagsOf(note: string | null | undefined): string[] {
  if (!note) return [];
  const tags: string[] = [];
  for (const m of note.normalize("NFC").matchAll(TAG_RE)) {
    const run = m[1];
    // A longer run is not a tag at all (never cut short); "#2024" has no letter.
    if ([...run].length > TAG_MAX || !LETTER.test(run)) continue;
    const tag = run.toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/** Every tag with how many transactions carry it; most used first, then by name. */
export function allTags(list: readonly { tags: readonly string[] }[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const t of list) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The tag when the search text is exactly one tag token ("#goa", " #Goa "), else null. */
export function tagQuery(text: string): string | null {
  const t = text.trim();
  const tags = tagsOf(t);
  return tags.length === 1 && normalise(t) === `#${tags[0]}` ? tags[0] : null;
}

/**
 * The tag being typed just before the caret: `start` is the index of its "#", `partial` is
 * normalised and may be "". null unless the text before the caret ends in a tag start (same
 * boundary rule, 0–30 tag characters) and the character at the caret (if any) isn't a tag character.
 */
export function partialTagAt(text: string, caret: number): { start: number; partial: string } | null {
  const m = PARTIAL_RE.exec(text.slice(0, caret));
  if (!m) return null;
  const next = text.slice(caret, caret + 2); // two UTF-16 units: enough for one code point
  if (next && TAG_CHAR.test([...next][0])) return null;
  return { start: m.index, partial: normalise(m[1]) };
}

/** Up to `limit` tags starting with `partial`, leaving out `partial` itself, in `all`'s order. */
export function suggestTags(all: readonly TagCount[], partial: string, limit = 5): TagCount[] {
  return all.filter((t) => t.tag.startsWith(partial) && t.tag !== partial).slice(0, limit);
}

/** Replaces text[start, caret) with "#tag", plus a space unless text[caret] is whitespace. */
export function insertTag(text: string, start: number, caret: number, tag: string): { text: string; caret: number } {
  const rest = text.slice(caret);
  const inserted = /^\s/.test(rest) ? `#${tag}` : `#${tag} `;
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length };
}
