// Text counting for the Tools counts bar (spec §5.3). Pure + reusable.

// Word = a run of Unicode letters/digits with internal connectors kept, to
// match Word / Google Docs:
//   - apostrophes, hyphens and dots between alphanumerics: don't, well-known,
//     e.g., i.e., U.S., 3.50, 3.5.2 each count as one word;
//   - commas and colons between digits: 1,000 and 12:30 each count as one word.
// A trailing connector with nothing after it (the dot in "Dr." or "e.g.") is
// not part of the word.
const WORD_RE = /[\p{L}\p{N}]+(?:(?:['’.\-][\p{L}\p{N}]+)|(?:[,:]\p{Nd}+))*/gu;

export function countWords(s: string): number {
  if (!s) return 0;
  const m = s.match(WORD_RE);
  return m ? m.length : 0;
}

// Characters as Unicode code points (so an emoji counts as one, not two UTF-16
// units). The word counter tool uses grapheme segmentation for its own cell.
export function countCharacters(s: string): number {
  return [...s].length;
}

export function countLines(s: string): number {
  return s === "" ? 0 : s.split(/\n/).length;
}

export interface TextCounts {
  words: number;
  characters: number;
  lines: number;
}

export function textCounts(s: string): TextCounts {
  return { words: countWords(s), characters: countCharacters(s), lines: countLines(s) };
}

// ---- Word counter (spec §8.1) ----------------------------------------------

// Grapheme count via Intl.Segmenter (an emoji with a modifier counts as one),
// falling back to code points where Segmenter is unavailable.
export function countGraphemes(s: string): number {
  if (!s) return 0;
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  }
  return [...s].length;
}

// "Without spaces" excludes all whitespace, then counts graphemes.
export function countCharactersNoSpaces(s: string): number {
  return countGraphemes(s.replace(/\s+/gu, ""));
}

// Abbreviations whose trailing dot must not end a sentence.
const ABBREVIATIONS = ["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "a.m", "p.m"];

// Mask dots that aren't sentence terminators (decimals, abbreviations) so the
// terminator split doesn't break on them.
function maskNonTerminators(s: string): string {
  let out = s.replace(/(\d)\.(\d)/g, "$1\u0000$2"); // decimals: 3.14
  out = out.replace(/\b(e)\.(g)\./gi, "$1\u0000$2\u0000");
  out = out.replace(/\b(i)\.(e)\./gi, "$1\u0000$2\u0000");
  out = out.replace(/\b(a|p)\.(m)\./gi, "$1\u0000$2\u0000");
  for (const a of ["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc"]) {
    out = out.replace(new RegExp(`\\b(${a})\\.`, "gi"), "$1\u0000");
  }
  return out;
}

// Sentences as strings: split on . ! ? followed by whitespace/end, ignoring the
// abbreviations above and decimals. A trailing run without punctuation still
// counts; a segment must contain a letter/digit to count. Masked dots are
// restored so callers (keyword phrases) see the original text.
export function splitSentences(s: string): string[] {
  if (!s.trim()) return [];
  return maskNonTerminators(s)
    .split(/[.!?]+(?=\s|$)/)
    .map((seg) => seg.replace(/\u0000/g, "."))
    .filter((seg) => /[\p{L}\p{N}]/u.test(seg));
}

export function countSentences(s: string): number {
  return splitSentences(s).length;
}

// Lowercased word tokens (§5.3 word definition), for keyword extraction.
export function tokenizeWords(s: string): string[] {
  const m = s.toLowerCase().match(WORD_RE);
  return m ? m : [];
}

// Paragraphs: blocks separated by one or more blank lines. A lone line break
// does not start a new paragraph.
export function countParagraphs(s: string): number {
  if (!s.trim()) return 0;
  return s
    .replace(/\r\n/g, "\n")
    .split(/\n[^\S\n]*\n\s*/)
    .filter((block) => /[\p{L}\p{N}]/u.test(block)).length;
}

export const READING_WPM = 238;
export const SPEAKING_WPM = 130;

export function readingSeconds(words: number): number {
  return (words / READING_WPM) * 60;
}

export function speakingSeconds(words: number): number {
  return (words / SPEAKING_WPM) * 60;
}

// Duration format (spec §8.1): <60s → "31s"; <60min → "4 min" (rounded);
// otherwise "1 h 12 min".
export function formatDuration(totalSeconds: number): string {
  const secs = Math.round(totalSeconds);
  if (secs < 60) return `${secs}s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
