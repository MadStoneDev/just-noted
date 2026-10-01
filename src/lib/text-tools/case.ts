// Pure text case + cleanup transforms. No DOM, no network — reusable by the
// tools UI and, later, the editor's "transform selection".

// Title Case small words (lowercased unless first/last word).
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "if", "in", "into", "nor",
  "of", "off", "on", "onto", "or", "over", "per", "so", "the", "to", "up",
  "via", "vs", "yet", "with", "from",
]);

// Split a string into word tokens, breaking on non-alphanumerics AND camelCase
// humps, so "helloWorld-foo" -> ["hello","World","foo"].
function splitWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function capitalizeFirst(w: string): string {
  // Uppercase the first letter only; leave the rest as given.
  return w.replace(/[a-zA-Z]/, (c) => c.toUpperCase());
}

// ===== Case =====

export function toUpperCase(s: string): string {
  return s.toUpperCase();
}

export function toLowerCase(s: string): string {
  return s.toLowerCase();
}

export function toSentenceCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, lead: string, c: string) => lead + c.toUpperCase());
}

export function toTitleCase(s: string): string {
  const words = s.trim().split(/\s+/);
  const last = words.length - 1;
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      const bare = lower.replace(/[^a-z0-9]/g, "");
      if (i !== 0 && i !== last && SMALL_WORDS.has(bare)) return lower;
      return capitalizeFirst(lower);
    })
    .join(" ");
}

export function toCapitalizeWords(s: string): string {
  // First letter of each whitespace-separated token; rest untouched.
  return s.replace(/(^|\s)(\S)/g, (_m, lead: string, c: string) => lead + c.toUpperCase());
}

export function toCamelCase(s: string): string {
  return splitWords(s)
    .map((w, i) => (i === 0 ? w.toLowerCase() : capitalizeFirst(w.toLowerCase())))
    .join("");
}

export function toPascalCase(s: string): string {
  return splitWords(s)
    .map((w) => capitalizeFirst(w.toLowerCase()))
    .join("");
}

export function toSnakeCase(s: string): string {
  return splitWords(s).map((w) => w.toLowerCase()).join("_");
}

export function toKebabCase(s: string): string {
  return splitWords(s).map((w) => w.toLowerCase()).join("-");
}

export function toConstantCase(s: string): string {
  return splitWords(s).map((w) => w.toUpperCase()).join("_");
}

// ===== Cleanup =====

export function trimText(s: string): string {
  return s.trim();
}

/** Collapse runs of spaces/tabs to a single space (newlines preserved). */
export function removeExtraSpaces(s: string): string {
  return s.replace(/[^\S\r\n]+/g, " ").replace(/ +(\r?\n)/g, "$1");
}

export function removeLineBreaks(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}

export function removeEmptyLines(s: string): string {
  return s
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

export function removeDuplicateLines(s: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of s.split(/\r?\n/)) {
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out.join("\n");
}

export function sortLinesAZ(s: string): string {
  return s
    .split(/\r?\n/)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .join("\n");
}

export function toStraightQuotes(s: string): string {
  return s.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"');
}

export function toCurlyQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{<])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{<])'/g, "$1‘")
    .replace(/'/g, "’");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ""));
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*([-*+])\s+/gm, "") // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "") // ordered list markers
    .replace(/^\s*([-*_]\s*){3,}$/gm, "") // horizontal rules
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$1") // strikethrough
    .trim();
}
