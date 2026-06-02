import type { ContentFormat } from "@/types/combined-notes";

/**
 * Fast regex-based HTML → plain text.
 * Safe to call on every keystroke (no DOM allocation).
 */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fast regex-based Markdown → plain text.
 * Safe to call on every keystroke (no DOM allocation).
 */
export function stripMarkdownToText(markdown: string): string {
  return markdown
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
    .replace(/\s+/g, " ")
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
