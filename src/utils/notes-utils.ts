// src/utils/notes-utils.ts
import { CombinedNote, ContentFormat } from "@/types/combined-notes";
import { stripContentToText } from "@/utils/html-utils";

/**
 * Conservative content normaliser for "has this note actually changed?" checks.
 *
 * It equates ONLY differences that never carry meaning: line-ending style
 * (CRLF vs LF) and trailing whitespace / blank lines at the end of the
 * document. It deliberately does NOT touch leading whitespace, per-line trailing
 * spaces (which can be Markdown hard breaks) or escaping — because this feeds a
 * save-skipping no-op, a false "equal" would silently drop a real edit. Keeping
 * it minimal means the worst case is a harmless extra save, never data loss.
 */
export function normalizeNoteContent(s?: string | null): string {
  if (!s) return "";
  return s.replace(/\r\n/g, "\n").replace(/[\s﻿ ]+$/g, "");
}

/** True when two note bodies are identical once trivially normalised. */
export function sameNoteContent(a?: string | null, b?: string | null): boolean {
  return normalizeNoteContent(a) === normalizeNoteContent(b);
}

// ── Semantic equality for the conflicted-copy decision ──────────────────────
//
// `sameNoteContent` above is deliberately byte-strict (it only forgives line
// endings / trailing whitespace). That is right for the save no-op, but it is
// too strict for deciding whether to spawn a "(conflicted copy)": a note can be
// re-serialised (a Markdown round-trip changes list markers / escaping) or even
// rewritten into a different FORMAT — an HTML-stored original saved back as
// Markdown by a collaborator's editor — without a single word changing. Those
// differ byte-for-byte yet represent the SAME authored content, so treating them
// as a conflict manufactures spurious copies (the reported bug).
//
// We equate two bodies when they have identical visible TEXT *and* an identical
// count of each formatting feature (a "fingerprint"). That survives serialisation
// and format noise, while a genuine formatting edit — the same words with a word
// newly bolded, linked, or turned into a heading — changes the fingerprint and is
// therefore NOT equated, so a real conflict is still preserved. Uncertainty errs
// toward "different" (keep the copy), the safe direction for a data-preservation
// net.

interface MarkupFingerprint {
  bold: number;
  italic: number;
  link: number;
  heading: number;
  listItem: number;
  code: number;
  quote: number;
  image: number;
  strike: number;
}

function countMatches(s: string, re: RegExp): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

function markdownFingerprint(md: string): MarkupFingerprint {
  // Count (and then remove) bold first so italic detection doesn't see the inner
  // `*`/`_` of `**bold**` as emphasis.
  const boldRe = /\*\*[^*\n]+\*\*|__[^_\n]+__/g;
  const bold = countMatches(md, boldRe);
  const noBold = md.replace(boldRe, " ");
  return {
    bold,
    italic: countMatches(noBold, /\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9])/g),
    // Links before images would double-count, so count images, then links that
    // are not image links.
    image: countMatches(md, /!\[[^\]]*\]\([^)]*\)/g),
    link: countMatches(md, /(?<!!)\[[^\]]*\]\([^)]*\)/g),
    heading: countMatches(md, /^#{1,6}\s+/gm),
    listItem: countMatches(md, /^\s*(?:[-*+]|\d+\.)\s+/gm),
    code: countMatches(md, /```|`[^`\n]+`/g),
    quote: countMatches(md, /^>\s+/gm),
    strike: countMatches(md, /~~[^~\n]+~~/g),
  };
}

function htmlFingerprint(html: string): MarkupFingerprint {
  return {
    bold: countMatches(html, /<(?:strong|b)\b/gi),
    italic: countMatches(html, /<(?:em|i)\b/gi),
    link: countMatches(html, /<a\b/gi),
    heading: countMatches(html, /<h[1-6]\b/gi),
    listItem: countMatches(html, /<li\b/gi),
    code: countMatches(html, /<(?:code|pre)\b/gi),
    quote: countMatches(html, /<blockquote\b/gi),
    image: countMatches(html, /<img\b/gi),
    strike: countMatches(html, /<(?:s|del|strike)\b/gi),
  };
}

function fingerprint(content: string, fmt: ContentFormat): MarkupFingerprint {
  return fmt === "markdown" ? markdownFingerprint(content) : htmlFingerprint(content);
}

function sameFingerprint(a: MarkupFingerprint, b: MarkupFingerprint): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.link === b.link &&
    a.heading === b.heading &&
    a.listItem === b.listItem &&
    a.code === b.code &&
    a.quote === b.quote &&
    a.image === b.image &&
    a.strike === b.strike
  );
}

/**
 * True when two note bodies represent the SAME authored content — identical
 * visible text and formatting structure — even if their bytes or formats differ
 * (re-serialisation, or an HTML original rewritten as Markdown). Used to stop a
 * note that was merely opened (not edited) from spawning a conflicted copy.
 *
 * Returns false for empty text: there is nothing to equate, and an empty body is
 * handled by the dedicated empty-content safety nets elsewhere.
 */
export function sameAuthoredContent(
  aContent: string | null | undefined,
  aFmt: ContentFormat,
  bContent: string | null | undefined,
  bFmt: ContentFormat,
): boolean {
  const ta = stripContentToText(aContent ?? "", aFmt);
  const tb = stripContentToText(bContent ?? "", bFmt);
  if (!ta || ta !== tb) return false;
  return sameFingerprint(fingerprint(aContent ?? "", aFmt), fingerprint(bContent ?? "", bFmt));
}

/**
 * Sort notes by order, pin status, and timestamps
 * New notes (identified by newNoteId) always appear at the top
 */
export function sortNotes(
  notesToSort: CombinedNote[],
  newNoteId?: string | null,
): CombinedNote[] {
  return [...notesToSort].sort((a, b) => {
    // PRIORITY 1: New note always at the very top
    if (newNoteId) {
      if (a.id === newNoteId) return -1;
      if (b.id === newNoteId) return 1;
    }

    // PRIORITY 2: Order 0 notes (newly created, not yet synced)
    const aIsOrderZero = a.order === 0;
    const bIsOrderZero = b.order === 0;

    if (aIsOrderZero && !bIsOrderZero) return -1;
    if (!aIsOrderZero && bIsOrderZero) return 1;

    // If both are order 0, sort by newest first (by createdAt)
    if (aIsOrderZero && bIsOrderZero) {
      return b.createdAt - a.createdAt;
    }

    // PRIORITY 3: Pinned status
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // PRIORITY 4: Order number (for notes with order > 0)
    if (a.order > 0 && b.order > 0) {
      return a.order - b.order;
    }

    // PRIORITY 5: Fall back to updated timestamp (newest first)
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * Normalize note ordering to sequential numbers
 */
export function normaliseOrdering(
  notesToNormalise: CombinedNote[],
): CombinedNote[] {
  const orderZeroNotes = notesToNormalise.filter((note) => note.order === 0);
  const regularNotes = notesToNormalise.filter((note) => note.order > 0);

  const sortedRegular = [...regularNotes].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });

  const pinnedRegular = sortedRegular.filter((note) => note.isPinned);
  const unpinnedRegular = sortedRegular.filter((note) => !note.isPinned);
  const pinnedOrderZero = orderZeroNotes.filter((note) => note.isPinned);
  const unpinnedOrderZero = orderZeroNotes.filter((note) => !note.isPinned);

  const finalOrder = [
    ...pinnedRegular,
    ...pinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
    ...unpinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
    ...unpinnedRegular,
  ];

  return finalOrder.map((note, index) => ({ ...note, order: index + 1 }));
}
