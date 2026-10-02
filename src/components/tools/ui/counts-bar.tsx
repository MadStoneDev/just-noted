"use client";

import React from "react";
import { countWords, countCharacters, countLines } from "@/lib/text-tools/counts";

// Live counts bar (spec §5.3). Selection-aware: when `selected` is non-empty it
// leads with the selected-word count. Numbers are locale-separated.
export default function CountsBar({
  text,
  selected = "",
  compact = false,
}: {
  text: string;
  selected?: string;
  // compact: two short-labelled parts on one non-wrapping line, for the narrow
  // mobile action bar (§9.5) where the full three-part pill would wrap/scroll.
  compact?: boolean;
}) {
  const n = (v: number) => v.toLocaleString();
  const words = countWords(text);
  const lines = countLines(text);
  const chars = countCharacters(text);
  const hasSel = selected.trim().length > 0;

  const Sep = () => <span className="text-[var(--color-ink-7)]">·</span>;
  const Part = ({ value, label }: { value: number; label: string }) => (
    <span className="whitespace-nowrap">
      <span className="text-[var(--color-ink)]">{n(value)}</span>{" "}
      <span className="text-[var(--color-ink-3)]">{label}</span>
    </span>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] font-[family-name:var(--font-meta)] text-[12px] whitespace-nowrap overflow-hidden">
        {hasSel ? (
          <>
            <Part value={countWords(selected)} label="sel" />
            <Sep />
            <Part value={words} label={words === 1 ? "word" : "words"} />
          </>
        ) : (
          <>
            <Part value={words} label={words === 1 ? "word" : "words"} />
            <Sep />
            <Part value={chars} label={chars === 1 ? "char" : "chars"} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 h-9 px-3 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] font-[family-name:var(--font-meta)] text-[12px]">
      {hasSel ? (
        <>
          <Part value={countWords(selected)} label="words selected" />
          <Sep />
          <Part value={words} label="words" />
          <Sep />
          <Part value={lines} label={lines === 1 ? "line" : "lines"} />
        </>
      ) : (
        <>
          <Part value={words} label={words === 1 ? "word" : "words"} />
          <Sep />
          <Part value={chars} label={chars === 1 ? "character" : "characters"} />
          <Sep />
          <Part value={lines} label={lines === 1 ? "line" : "lines"} />
        </>
      )}
    </div>
  );
}
