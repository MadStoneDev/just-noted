// Pure slug generation (spec §6.3). No DOM, no network — reusable anywhere (the
// tools UI today, the editor's "convert selection" later). All local.

export interface SlugOptions {
  /** Drop filler words (§6.4). */
  removeFillerWords?: boolean;
  /** Trim to this length at a word boundary. 0 / undefined = no limit. */
  maxLength?: number;
}

export interface SlugResult {
  slug: string;
  /** Filler words actually dropped, in order of appearance, deduplicated. */
  removed: string[];
  /** Whether maxLength trimmed the slug. */
  trimmed: boolean;
}

// §6.4 — English filler list. Listed in full in the FAQ answer too.
const FILLER_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "at",
  "by", "for", "with", "from", "as", "into", "onto", "than", "that", "this",
  "is", "are", "was", "be",
]);

// §6.3 step 2 — ligatures / special letters NFKD doesn't decompose.
const TRANSLIT: Record<string, string> = {
  "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "þ": "th",
};

function transliterate(s: string): string {
  let out = "";
  for (const ch of s) out += TRANSLIT[ch] ?? ch;
  return out;
}

export function slugifyDetailed(input: string, opts: SlugOptions = {}): SlugResult {
  if (!input) return { slug: "", removed: [], trimmed: false };

  // 1. NFKD + strip combining marks (é → e). 2. transliterate ligatures.
  let s = transliterate(input.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  // 3. & → " and " (before filler removal). 4. lowercase.
  s = s.replace(/&/g, " and ").toLowerCase();
  // 5. remove apostrophes without splitting (don't → dont).
  s = s.replace(/['‘’ʼ`]/g, "");
  // 6. every run of non [a-z0-9] → a single space. 7. split into words.
  const words = s.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

  // 8. drop filler words — unless that would leave zero words (then keep all).
  const removed: string[] = [];
  let kept = words;
  if (opts.removeFillerWords) {
    const filtered: string[] = [];
    for (const w of words) {
      if (FILLER_WORDS.has(w)) {
        if (!removed.includes(w)) removed.push(w);
      } else {
        filtered.push(w);
      }
    }
    if (filtered.length > 0) kept = filtered;
    else removed.length = 0; // would empty the slug — keep them all, report none
  }

  // 9. join with "-".
  let slug = kept.join("-");

  // 10. trim at a word boundary if over maxLength.
  let trimmed = false;
  if (opts.maxLength && opts.maxLength > 0 && slug.length > opts.maxLength) {
    trimmed = true;
    let cut = slug.slice(0, opts.maxLength);
    const lastHyphen = cut.lastIndexOf("-");
    // Never cut inside a word — unless the first word alone exceeds the limit.
    if (lastHyphen > 0) cut = cut.slice(0, lastHyphen);
    slug = cut;
  }

  // 11. trim leading/trailing hyphens.
  slug = slug.replace(/^-+|-+$/g, "");
  return { slug, removed, trimmed };
}

export function slugify(input: string, opts: SlugOptions = {}): string {
  return slugifyDetailed(input, opts).slug;
}

export interface BatchResult {
  /** One output line per input line (blank in → blank out). */
  outputs: string[];
  titleCount: number;
  slugCount: number;
  duplicateCount: number;
  truncated: boolean;
}

const BATCH_LIMIT = 1000;

// §6.6 — one title per line → one slug per line. Duplicate slugs get -2, -3…
// (the suffix counts toward maxLength: trim words first, then append). Blank
// lines are preserved so pasted rows stay aligned. Capped at 1,000 lines.
export function slugifyBatch(input: string, opts: SlugOptions = {}): BatchResult {
  const allLines = input.split(/\r?\n/);
  const truncated = allLines.length > BATCH_LIMIT;
  const lines = truncated ? allLines.slice(0, BATCH_LIMIT) : allLines;

  const seen = new Map<string, number>();
  const outputs: string[] = [];
  let titleCount = 0;
  let slugCount = 0;
  let duplicateCount = 0;

  for (const line of lines) {
    if (line.trim() === "") { outputs.push(""); continue; }
    titleCount += 1;
    const base = slugifyDetailed(line, opts).slug;
    if (base === "") { outputs.push(""); continue; }
    const prior = seen.get(base) ?? 0;
    seen.set(base, prior + 1);
    let out = base;
    if (prior > 0) {
      duplicateCount += 1;
      const suffix = `-${prior + 1}`;
      // Keep within maxLength including the suffix.
      if (opts.maxLength && opts.maxLength > 0 && base.length + suffix.length > opts.maxLength) {
        out = slugifyDetailed(line, { ...opts, maxLength: opts.maxLength - suffix.length }).slug + suffix;
      } else {
        out = base + suffix;
      }
    }
    outputs.push(out);
    slugCount += 1;
  }

  return { outputs, titleCount, slugCount, duplicateCount, truncated };
}
