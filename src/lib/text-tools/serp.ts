// Search-result preview geometry (spec §8.2). Truncation is by PIXEL WIDTH, not
// character count, so every function takes an injected `measure(text) => px`.
// The component passes a canvas `measureText` in the right Arial size; tests
// pass a deterministic fake (e.g. one unit per character).

export type Measure = (s: string) => number;

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

// Fit one line to maxWidth at a whole-word boundary, leaving room for an
// ellipsis. Returns the visible text WITHOUT the ellipsis plus whether it was
// truncated. A single over-long word is hard-trimmed by characters.
export function fitSingleLine(text: string, maxWidth: number, measure: Measure): { visible: string; truncated: boolean } {
  const t = normalize(text);
  if (t === "" || measure(t) <= maxWidth) return { visible: t, truncated: false };

  const words = t.split(" ");
  let acc = "";
  for (const w of words) {
    const next = acc ? `${acc} ${w}` : w;
    if (measure(`${next}…`) > maxWidth) break;
    acc = next;
  }
  if (acc === "") {
    // First word alone is too wide — trim it by characters.
    let k = t.length;
    while (k > 0 && measure(`${t.slice(0, k)}…`) > maxWidth) k--;
    acc = t.slice(0, k);
  }
  return { visible: acc, truncated: true };
}

// Wrap into at most maxLines lines at word boundaries. If content remains, the
// last line is ellipsised to fit. Returns the visible lines and whether
// anything was dropped.
export function wrapToLines(text: string, maxWidth: number, maxLines: number, measure: Measure): { lines: string[]; truncated: boolean } {
  const t = normalize(text);
  if (t === "") return { lines: [], truncated: false };

  const words = t.split(" ");
  const lines: string[] = [];
  let cur = "";
  let idx = 0;

  while (idx < words.length) {
    const w = words[idx];
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxWidth) {
      cur = next;
      idx++;
    } else if (cur === "") {
      // Over-long single word: place it and move on.
      lines.push(w);
      idx++;
      if (lines.length >= maxLines) break;
    } else {
      lines.push(cur);
      cur = "";
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) {
    lines.push(cur);
    cur = "";
  }

  const remaining = idx < words.length || cur !== "";
  if (remaining && lines.length > 0) {
    // Ellipsise the final visible line.
    const last = lines[lines.length - 1];
    let line = last;
    while (line && measure(`${line}…`) > maxWidth) {
      const trimmed = line.replace(/\s*\S+$/, "");
      if (trimmed === "") {
        let k = last.length;
        while (k > 0 && measure(`${last.slice(0, k)}…`) > maxWidth) k--;
        line = last.slice(0, k);
        break;
      }
      line = trimmed;
    }
    lines[lines.length - 1] = line;
  }

  return { lines, truncated: remaining };
}

// Approximate number of characters to remove so the whole (single-line) string
// fits within maxWidth — for the "Shorten by about N characters" status.
export function overflowChars(text: string, maxWidth: number, measure: Measure): number {
  const t = normalize(text);
  if (measure(t) <= maxWidth) return 0;
  let k = t.length;
  while (k > 0 && measure(t.slice(0, k)) > maxWidth) k--;
  return t.length - k;
}

// Characters to remove so wrapped text fits within maxLines lines.
export function overflowCharsWrapped(text: string, maxWidth: number, maxLines: number, measure: Measure): number {
  const t = normalize(text);
  const { lines, truncated } = wrapToLines(t, maxWidth, maxLines, measure);
  if (!truncated) return 0;
  const kept = lines.join(" ").length;
  return Math.max(1, t.length - kept);
}

// The tail of the visible text, for the status quote: `…in 2026 | Just`.
export function cutTail(visible: string, chars = 15): string {
  const v = visible.trimEnd();
  return `…${v.slice(-chars).trimStart()}`;
}
