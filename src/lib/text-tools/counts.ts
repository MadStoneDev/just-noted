// Text counting for the Tools counts bar (spec §5.3). Pure + reusable.

// Word = a run of Unicode letters/digits, with internal apostrophes and hyphens
// kept, so "don't" and "well-known" each count as one word.
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

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
