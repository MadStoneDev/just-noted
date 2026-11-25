// Markdown normalisation at the two points markdown crosses the editor boundary:
// on load (cleanCorruptedMarkdown before Milkdown parses stored content, and the
// emptyLineMarker remark plugin while it parses) and on save (the remark-stringify
// options, as Milkdown serialises the doc). Kept free of React/DOM so the
// round-trip tests exercise exactly what the editor runs.
//
// The invariant these protect: parse(serialise(doc)) === doc, and
// serialise(parse(md)) === md for markdown the editor wrote — so opening and
// editing a note never changes content the user didn't touch.

import type { SliceType } from "@milkdown/ctx";
import type { remarkStringifyOptionsCtx } from "@milkdown/core";
import { $remark } from "@milkdown/utils";
import { EMPTY_LINE_MARKER, isEmptyLineMarkerText } from "@/utils/empty-line-marker";

// remark-stringify's Options, taken from Milkdown's slice (remark-stringify is
// only a transitive dependency).
type StringifyOptions =
  typeof remarkStringifyOptionsCtx extends SliceType<infer T, string> ? T : never;
type JoinFn = NonNullable<StringifyOptions["join"]>[number];
type Handlers = NonNullable<StringifyOptions["handlers"]>;
type HtmlHandler = NonNullable<Handlers["html"]>;

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

// ── Intentional empty lines ───────────────────────────────────────────────────
//
// An empty line typed mid-note is an empty paragraph. Markdown has no such
// thing (blank lines only separate blocks), so Milkdown's commonmark preset
// serialises each one as a standalone `<br />` and its remark-preserve-empty-line
// plugin parses that back. We store `&nbsp;` instead (EMPTY_LINE_MARKER): `<br />`
// leaked into exports and made markdown look like HTML to the app's
// /<[a-z]…>/ sniffing. An earlier fix simply deleted the `<br />` lines on save
// (stripEmptyParagraphBreaks), which lost every intentional empty line on the
// next reload, and its whole-text regexes rewrote `<br>` inside code too.
//
// Both halves work on the syntax tree, so code blocks and inline code are never
// touched:
//   save: emptyLineHtmlHandler writes the preset's empty-paragraph `<br />` as
//         `&nbsp;` (indentation inside list items comes from the serialiser).
//   load: emptyLineMarker turns a paragraph whose only content is the parsed
//         marker (a lone U+00A0) back into an empty paragraph. Notes saved
//         before this still contain `<br />` lines; the preset still parses
//         those, and they're rewritten as `&nbsp;` on the next save.

const BR = /^<br\s*\/?>$/i;

type MdNode = { type: string; value?: unknown; children?: MdNode[] };

/** remark-stringify `html` handler: an empty paragraph's `<br />` → the marker. */
export const emptyLineHtmlHandler: HtmlHandler = (node, parent) => {
  const value = String(node.value ?? "");
  if (
    parent?.type === "paragraph" &&
    parent.children.length === 1 &&
    BR.test(value.trim())
  ) {
    return EMPTY_LINE_MARKER;
  }
  return value;
};

/** Parse-side transform: a paragraph holding only the marker → empty paragraph. */
export function restoreEmptyLines(tree: MdNode): void {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    if (
      node.type === "paragraph" &&
      node.children.length === 1 &&
      node.children[0].type === "text" &&
      isEmptyLineMarkerText(String(node.children[0].value ?? ""))
    ) {
      node.children = [];
      return;
    }
    node.children.forEach(walk);
  };
  walk(tree);
}

/** Milkdown plugin running restoreEmptyLines on every parse (load and paste). */
export const emptyLineMarker = $remark(
  "jn-empty-line-marker",
  () => () => (tree) => restoreEmptyLines(tree as unknown as MdNode),
);

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
  handlers: { html: emptyLineHtmlHandler },
};
