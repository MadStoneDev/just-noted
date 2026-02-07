/**
 * Shared HTML-to-text utilities.
 * Centralises the most common stripping patterns used across the codebase.
 */

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
 * Truncated preview suitable for sidebar / collapsed notes.
 */
export function getPlainTextPreview(html: string, maxLength = 200): string {
  const text = stripHtmlToText(html);
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}
