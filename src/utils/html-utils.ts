import type { ContentFormat } from "@/types/combined-notes";
import { stripEmptyLineMarkers } from "@/utils/empty-line-marker";

// Named entities seen in note content (the editor, Turndown output, pasted
// web text). Anything else named is left as written.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", bull: "\u2022", middot: "\u00B7",
  copy: "\u00A9", reg: "\u00AE", trade: "\u2122", deg: "\u00B0", times: "\u00D7",
  euro: "\u20AC", pound: "\u00A3", cent: "\u00A2", zwj: "\u200D", zwnj: "\u200C",
  ensp: " ", emsp: " ", thinsp: " ",
};

/**
 * Decode HTML character references (&nbsp; &amp; &#39; &#x27; &rsquo; …) to
 * text, for previews and search. One pass, so "&amp;lt;" becomes "&lt;", not
 * "<". A non-breaking space becomes a plain space. No DOM allocation.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return code === 0xa0 ? " " : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/**
 * Fast regex-based HTML → plain text.
 * Safe to call on every keystroke (no DOM allocation).
 */
export function stripHtmlToText(html: string): string {
  // Tags first, then entities: an escaped "&lt;b&gt;" is text and stays "<b>".
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

/**
 * Fast regex-based Markdown → plain text.
 * Safe to call on every keystroke (no DOM allocation).
 */
export function stripMarkdownToText(markdown: string): string {
  return stripEmptyLineMarkers(markdown)
    .replace(/`{3}[\s\S]*?`{3}/g, " ")     // code blocks (first, before inline)
    .replace(/^#{1,6}\s+/gm, "")           // headings
    .replace(/^[-*]\s*\[[ x]\]\s*/gm, "")  // task list markers
    .replace(/^[-*+]\s+/gm, "")            // unordered list markers
    .replace(/^\d+\.\s+/gm, "")            // ordered list markers
    .replace(/^>\s+/gm, "")                // blockquotes
    .replace(/---+/g, " ")                 // horizontal rules
    .replace(/!\[.*?\]\(.*?\)/g, " ")      // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/\*\*([^*]*)\*\*/g, "$1")     // bold
    .replace(/\*([^*]*)\*/g, "$1")         // italic
    .replace(/~~([^~]*)~~/g, "$1")         // strikethrough
    .replace(/==([^=]*)==/g, "$1")         // highlight
    .replace(/`([^`]*)`/g, "$1")           // inline code
    .replace(/<\/?[^>]+>/g, "")            // remaining HTML tags
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m) => decodeHtmlEntities(m)) // entities (after tags)
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

/**
 * Strip content to plain text, auto-detecting format.
 */
export function stripContentToText(
  content: string,
  format: ContentFormat = "html",
): string {
  if (!content) return "";
  if (format === "markdown") return stripMarkdownToText(content);
  return stripHtmlToText(content);
}

/**
 * Truncated preview suitable for sidebar / collapsed notes.
 */
export function getPlainTextPreview(
  content: string,
  maxLength = 200,
  format: ContentFormat = "html",
): string {
  const text = stripContentToText(content, format);
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}
