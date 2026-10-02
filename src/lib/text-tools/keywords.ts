// Keyword frequency for the word counter (spec §8.1). Pure + testable.
//
// Terms are lowercased, with no stemming. Phrases (2/3 words) never span a
// sentence boundary. A phrase is excluded by the stopword filter only when it
// *starts or ends* with a stopword. Language detection is not implemented yet,
// so the English stopword list is always used (the spec's documented fallback).

import { splitSentences, tokenizeWords } from "./counts";

// A compact English stopword set — articles, pronouns, prepositions, auxiliaries
// and the most common function words.
export const EN_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "doing", "done", "for", "from", "had",
  "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
  "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself",
  "just", "me", "my", "myself", "no", "nor", "not", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own",
  "same", "she", "should", "so", "some", "such", "than", "that", "the", "their",
  "theirs", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
]);

export interface KeywordRow {
  term: string;
  count: number;
  pct: number; // percentage of total words, one decimal
}

export interface KeywordOptions {
  phraseLen?: 1 | 2 | 3;
  excludeCommon?: boolean;
  limit?: number;
  totalWords?: number; // for pct; defaults to the token total
}

function isStopword(token: string): boolean {
  return EN_STOPWORDS.has(token);
}

// A pure-number token (no letters): "3", "50", "3.50", "1,000", "12:30". These
// are never meaningful keywords. "3rd" and "COVID19" contain letters, so they
// are kept.
function isNumeric(token: string): boolean {
  return !/\p{L}/u.test(token);
}

// Single words: pure numbers are always excluded; common words are excluded
// only when the toggle is on. Phrases: excluded when they start or end with a
// stopword or a number (toggle on) — otherwise kept.
function phraseAllowed(tokens: string[], exclude: boolean): boolean {
  if (tokens.length === 1) {
    if (isNumeric(tokens[0])) return false;
    return exclude ? !isStopword(tokens[0]) : true;
  }
  if (!exclude) return true;
  const bad = (t: string) => isStopword(t) || isNumeric(t);
  return !bad(tokens[0]) && !bad(tokens[tokens.length - 1]);
}

export function extractKeywords(text: string, opts: KeywordOptions = {}): KeywordRow[] {
  const phraseLen = opts.phraseLen ?? 1;
  const excludeCommon = opts.excludeCommon ?? true;
  const limit = opts.limit ?? 50;

  const counts = new Map<string, number>();
  let tokenTotal = 0;

  // n-grams within each sentence, so phrases never cross a boundary.
  for (const sentence of splitSentences(text)) {
    const tokens = tokenizeWords(sentence);
    tokenTotal += tokens.length;
    for (let i = 0; i + phraseLen <= tokens.length; i++) {
      const gram = tokens.slice(i, i + phraseLen);
      if (!phraseAllowed(gram, excludeCommon)) continue;
      const term = gram.join(" ");
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  const total = opts.totalWords ?? tokenTotal;
  const rows: KeywordRow[] = [];
  for (const [term, count] of counts) {
    rows.push({ term, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 });
  }
  // Most frequent first; ties broken alphabetically for stable output.
  rows.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  return rows.slice(0, limit);
}
