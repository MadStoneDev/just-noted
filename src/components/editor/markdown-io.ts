// Markdown normalisation at the two points markdown crosses the editor boundary:
// on load (cleanCorruptedMarkdown, before Milkdown parses stored content) and on
// save (the remark-stringify options + stripEmptyParagraphBreaks, as Milkdown
// serialises the doc). Kept free of React/DOM so the round-trip tests exercise
// exactly what the editor runs.
//
// The invariant these protect: parse(serialise(doc)) === doc, and
// serialise(parse(md)) === md for markdown the editor wrote — so opening and
// editing a note never changes content the user didn't touch.

import type { SliceType } from "@milkdown/ctx";
import type { remarkStringifyOptionsCtx } from "@milkdown/core";

// remark-stringify's Options, taken from Milkdown's slice (remark-stringify is
// only a transitive dependency).
type StringifyOptions =
  typeof remarkStringifyOptionsCtx extends SliceType<infer T, string> ? T : never;
type JoinFn = NonNullable<StringifyOptions["join"]>[number];

// CommonMark code spans: a run of N backticks up to the next run of exactly N.
const CODE_SPAN = /(`+)[\s\S]*?\1/g;

/** Apply `fn` only to the text outside inline code spans. */
function outsideCodeSpans(text: string, fn: (segment: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(CODE_SPAN)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + fn(text.slice(last));
}

/**
 * Repairs one legacy corruption on load: a task list collapsed onto a single
 * line ("- [ ] a - [ ] b - [ ] c" with no newlines at all).
 *
 * It must NOT touch anything else. In particular it never removes backslashes:
 * the serialiser escapes literal characters on purpose (`\-`, `\*`, `\[`), and
 * an earlier version that stripped those escapes on every load turned literal
 * text into structure — "- \- two" reloaded as a nested list, "\*a\*" as
 * italics — and the damage was saved on the next edit. A single-line note has
 * no fenced code blocks; inline code spans are left exactly as written.
 */
export function cleanCorruptedMarkdown(text: string): string {
  if (!text || text.includes("\n")) return text;

  let markerCount = 0;
  outsideCodeSpans(text, (segment) => {
    markerCount += (segment.match(/[*\-]\s*\[[ x]\]/gi) || []).length;
    return segment;
  });
  if (markerCount <= 2) return text;

  return outsideCodeSpans(text, (segment) =>
    segment.replace(/\s+([*\-])\s*\[( |x)\]\s*/gi, "\n- [$2] "),
  ).replace(/^\n+/, "");
}

/**
 * Milkdown's commonmark preset bundles `remark-preserve-empty-line`, which
 * serialises every blank line the user types between paragraphs as a standalone
 * `<br />` node. That literal `<br />` then leaks into stored markdown, exports
 * and shared-note HTML (the design brief calls this out as a bug: paragraph
 * breaks must be real markdown newlines, never `<br />`).
 *
 * We normalise at the single point markdown leaves the editor: drop standalone
 * `<br />` lines (each was an empty paragraph — the surrounding blank lines
 * already encode the paragraph break), neutralise any stray inline `<br>` to a
 * newline, then collapse 3+ blank lines to a single blank line.
 */
export function stripEmptyParagraphBreaks(md: string): string {
  if (!md || md.indexOf("<br") === -1) return md;
  const withoutStandalone = md
    .split("\n")
    .filter((line) => !/^\s*<br\s*\/?>\s*$/i.test(line))
    .join("\n");
  return withoutStandalone
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Blank lines between list items / inside an item, decided from `spread`.
 *
 * Milkdown stores a PARSED list's `spread` as the string "true"/"false", and its
 * bullet-list and plain list-item serialisers pass that string straight to
 * mdast. mdast-util-to-markdown only honours a boolean `spread`, so every
 * reloaded list fell through to its default (a blank line) and tight lists came
 * back loose. Typed nodes instead carry the schema defaults (list_item: true,
 * bullet_list: false), which say nothing about what the user wrote.
 *
 * So: loose only when the markdown was loose ("true"), or a list explicitly
 * marked spread. Two paragraphs in one item still need their blank line.
 */
export const listSpreadJoin: JoinFn = (left, right, parent) => {
  if (parent.type !== "list" && parent.type !== "listItem") return undefined;
  if (left.type === "paragraph" && right.type === "paragraph") return undefined;
  const spread = (parent as { spread?: unknown }).spread;
  if (spread === "true") return 1;
  if (parent.type === "list" && spread === true) return 1;
  return 0;
};

/** remark-stringify options for the editor's serialiser (remarkStringifyOptionsCtx). */
export const markdownStringifyOptions: StringifyOptions = {
  bullet: "-",
  listItemIndent: "one",
  join: [listSpreadJoin],
};
