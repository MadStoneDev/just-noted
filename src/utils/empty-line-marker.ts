// The empty-line marker: how an intentional empty line (an empty paragraph in
// the editor) is stored in markdown. Plain markdown has no empty paragraph —
// blank lines only separate blocks — so each one is written as a `&nbsp;` line
// (indented to its container inside a list item, `> &nbsp;` in a quote) and
// parsed back as an empty paragraph. See src/components/editor/markdown-io.ts.
//
// `&nbsp;` rather than `<br />` (Milkdown's own form): it renders as a blank
// line in any markdown viewer, and it doesn't make markdown look like HTML to
// the /<[a-z]…>/ sniffing the app does on note content.
//
// The marker is real content: Markdown/TXT/HTML exports keep the empty lines.
// Only places that show or measure the note's TEXT hide it (previews, search,
// word/character counts, version history, link previews, text sent to AI).

/** What an empty paragraph is stored as. */
export const EMPTY_LINE_MARKER = "&nbsp;";

const NBSP = " ";

// A whole line that is only the marker, optionally inside quotes / indented.
// After markdown → HTML → text it's a bare non-breaking space, so accept that too.
const MARKER_LINE = /^[ \t]*(?:>[ \t]*)*(?:&nbsp;| )[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** True for a paragraph's text that is exactly the parsed marker. */
export function isEmptyLineMarkerText(text: string): boolean {
  return text === NBSP;
}

/**
 * Hide empty-line markers from note text that is shown or measured rather than
 * edited. By default marker lines are removed; with `keepLines` each becomes a
 * truly empty line (for raw views where the gap itself should still show).
 * Lines inside fenced code blocks are content, never markers, and are kept.
 */
export function stripEmptyLineMarkers(
  md: string,
  { keepLines = false }: { keepLines?: boolean } = {},
): string {
  if (!md || (md.indexOf("&nbsp;") === -1 && md.indexOf(NBSP) === -1)) return md;
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (f) {
      fence = f[1];
      out.push(line);
      continue;
    }
    if (MARKER_LINE.test(line)) {
      if (keepLines) out.push("");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Plain-text form of a rendered note (TXT export): a line that is only
 * non-breaking spaces — what a `&nbsp;` empty-line paragraph renders to —
 * becomes a truly empty line.
 */
export function blankEmptyLineMarkers(text: string): string {
  if (!text || text.indexOf(NBSP) === -1) return text;
  return text.replace(/^[ \t ]* [ \t ]*$/gm, "");
}
