"use client";

import React from "react";
import { countWords, countCharacters, countLines } from "@/lib/text-tools/counts";

// Live counts bar (spec §5.3). Selection-aware: when `selected` is non-empty it
// leads with the selected-word count. Numbers are locale-separated.
export default function CountsBar({
  text,
  selected = "",
}: {
  text: string;
  selected?: string;
}) {
  const n = (v: number) => v.toLocaleString();
  const words = countWords(text);
  const lines = countLines(text);
  const chars = countCharacters(text);
  const hasSel = selected.trim().length > 0;

  const Sep = () => <span className="text-[var(--color-ink-7)]">·</span>;
  const Part = ({ value, label }: { value: number; label: string }) => (
    <span>
      <span className="text-[var(--color-ink)]">{n(value)}</span>{" "}
      <span className="text-[var(--color-ink-3)]">{label}</span>
    </span>
  );

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
