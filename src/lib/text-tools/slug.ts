// Pure slug generation. No DOM, no network — safe to reuse anywhere (the tools
// UI today, the editor's "convert selection" later). All processing is local.

export interface SlugOptions {
  /** Drop common filler words (a, an, the, of, and, or, to, in, for, on, with, at, by). */
  removeFillerWords?: boolean;
  /** Cut the slug at a word (hyphen) boundary no longer than this. 0 / undefined = no limit. */
  maxLength?: number;
}

const FILLER_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "in", "for", "on", "with", "at", "by",
]);

/** Turn a single title into a slug. */
export function slugify(input: string, opts: SlugOptions = {}): string {
  if (!input) return "";

  // Strip accents (decompose, drop combining marks), then lowercase.
  let s = input.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // "&" -> "and", then remove apostrophes (straight + curly) so "don't" -> "dont".
  s = s.replace(/&/g, " and ");
  s = s.replace(/['‘’ʼ`]/g, "");

  if (opts.removeFillerWords) {
    s = s
      .split(/\s+/)
      .filter((w) => {
        const bare = w.replace(/[^a-z0-9]/g, "");
        return bare.length > 0 && !FILLER_WORDS.has(bare);
      })
      .join(" ");
  }

  // Everything non-alphanumeric becomes a hyphen; collapse and trim.
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  if (opts.maxLength && opts.maxLength > 0 && s.length > opts.maxLength) {
    s = cutAtWordBoundary(s, opts.maxLength);
  }
  return s;
}

function cutAtWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  // Cut back to the last whole word, unless the first word already exceeds max
  // (then a hard cut is the only option).
  if (lastHyphen > 0) cut = cut.slice(0, lastHyphen);
  return cut.replace(/-+$/g, "");
}

/** Batch mode: one title per line in, one slug per line out (blank lines kept). */
export function slugifyLines(input: string, opts: SlugOptions = {}): string {
  return input
    .split(/\r?\n/)
    .map((line) => slugify(line, opts))
    .join("\n");
}
