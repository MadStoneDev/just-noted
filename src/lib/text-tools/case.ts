// Pure text case + cleanup transforms (spec §7.2). No DOM, no network.

// Title Case small words — kept lowercase unless first/last in the line or after
// a colon (§7.2 exact list).
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "so", "the", "to", "up", "yet", "via",
]);

function perLine(s: string, fn: (line: string) => string): string {
  return s.split("\n").map(fn).join("\n");
}

// Split into word tokens: break on anything that isn't a letter/digit AND on
// camelCase humps. Accented letters are kept (\p{L}).
function splitWords(s: string): string[] {
  return s
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function capFirst(w: string): string {
  return w.replace(/\p{L}/u, (c) => c.toUpperCase());
}

// ===== Case =====

export function toUpperCase(s: string): string {
  return s.toUpperCase();
}

export function toLowerCase(s: string): string {
  return s.toLowerCase();
}

export function toSentenceCase(s: string): string {
  // Capitalise the first letter of each sentence (split on . ! ? + whitespace,
  // and on line breaks), then restore the standalone pronoun "I".
  const out = s
    .toLowerCase()
    .replace(/(^\s*|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, lead: string, c: string) => lead + c.toUpperCase());
  return out.replace(/\bi\b/g, "I");
}

export function toTitleCase(s: string): string {
  return perLine(s, (line) => {
    // Split keeping the whitespace tokens so spacing is preserved exactly — only
    // letters change.
    const tokens = line.split(/(\s+)/);
    const wordIdxs: number[] = [];
    tokens.forEach((t, i) => { if (/\S/.test(t)) wordIdxs.push(i); });
    const first = wordIdxs[0];
    const last = wordIdxs[wordIdxs.length - 1];
    let afterColon = false;
    return tokens
      .map((t, i) => {
        if (!/\S/.test(t)) return t; // whitespace unchanged
        const lower = t.toLowerCase();
        const bare = lower.replace(/[^\p{L}\p{N}]/gu, "");
        const forceCap = i === first || i === last || afterColon;
        afterColon = t.endsWith(":");
        if (!forceCap && SMALL_WORDS.has(bare)) return lower;
        return capFirst(lower);
      })
      .join("");
  });
}

export function toCapitalizeWords(s: string): string {
  // First letter of every word upper, the rest lower.
  return s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

// Developer cases apply PER LINE.
export function toCamelCase(s: string): string {
  return perLine(s, (line) =>
    splitWords(line).map((w, i) => (i === 0 ? w.toLowerCase() : capFirst(w.toLowerCase()))).join(""),
  );
}

export function toPascalCase(s: string): string {
  return perLine(s, (line) => splitWords(line).map((w) => capFirst(w.toLowerCase())).join(""));
}

export function toSnakeCase(s: string): string {
  return perLine(s, (line) => splitWords(line).map((w) => w.toLowerCase()).join("_"));
}

export function toKebabCase(s: string): string {
  return perLine(s, (line) => splitWords(line).map((w) => w.toLowerCase()).join("-"));
}

export function toConstantCase(s: string): string {
  return perLine(s, (line) => splitWords(line).map((w) => w.toUpperCase()).join("_"));
}

// ===== Cleanup =====

/** Trim leading/trailing whitespace on every line. */
export function trimText(s: string): string {
  return perLine(s, (l) => l.trim());
}

/** Collapse runs of spaces/tabs to a single space (newlines preserved). */
export function removeExtraSpaces(s: string): string {
  return s.replace(/[^\S\r\n]+/g, " ").replace(/ +(\r?\n)/g, "$1");
}

export function removeLineBreaks(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}

export function removeEmptyLines(s: string): string {
  return s.split("\n").filter((l) => l.trim().length > 0).join("\n");
}

/** Keep the first occurrence of each line (exact match, after trimming). */
export function removeDuplicateLines(s: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of s.split("\n")) {
    const key = line.trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
  }
  return out.join("\n");
}

export function sortLinesAZ(s: string): string {
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return s.split("\n").sort((a, b) => collator.compare(a, b)).join("\n");
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
  // Block-level close tags become line breaks, then strip remaining tags.
  const withBreaks = s.replace(/<\/(p|div|h[1-6]|li|br|tr)\s*>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*+])\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .trim();
}
