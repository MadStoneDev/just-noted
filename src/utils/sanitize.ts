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
  "href", "src", "alt", "title", "class",
  "target", "rel",
  "width", "height",
  // NOTE: "style" and "id" are intentionally NOT allowed. Untrusted note HTML
  // is rendered to other users on shared pages; inline `style` enables CSS
  // injection / clickjacking overlays and `id` enables DOM clobbering. Styling
  // is driven by class-based rules instead.
  "data-type", "data-checked", "type", "checked", "disabled",
  "colspan", "rowspan",
  "align",
];

let hookRegistered = false;

/**
 * Force `rel="noopener noreferrer"` on any link that opens a new tab, so a
 * shared note can't reverse-tabnab the viewer's JustNoted tab.
 */
function ensureHook() {
  if (hookRegistered) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof Element && node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  hookRegistered = true;
}

/**
 * Sanitizes HTML content with a restrictive allowlist.
 * Use this everywhere `dangerouslySetInnerHTML` is used.
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") {
    // Server-side: return empty string since DOMPurify requires DOM
    return "";
  }
  ensureHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
