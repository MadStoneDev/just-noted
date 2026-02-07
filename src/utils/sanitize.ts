import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "del",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr", "span", "div", "sub", "sup",
  "input", // for task list checkboxes
  "label",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "class", "id",
  "target", "rel",
  "width", "height",
  "style",
  "data-type", "data-checked", "type", "checked", "disabled",
  "colspan", "rowspan",
  "align",
];

/**
 * Sanitizes HTML content with a restrictive allowlist.
 * Use this everywhere `dangerouslySetInnerHTML` is used.
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") {
    // Server-side: return empty string since DOMPurify requires DOM
    return "";
  }
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
