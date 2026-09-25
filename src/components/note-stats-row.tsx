"use client";

import React from "react";
import { useNoteStatistics } from "@/hooks/use-note-statistics";

// Read-only stats line for shared notes, mirroring the main editor's stats row
// (words · chars · reading time · page estimate · goal progress). Page size isn't
// stored per note, so the estimate uses the editor's default "novel" format.
// Non-owners can't change goal/page — this is display only.
export default function NoteStatsRow({
  content,
  goal,
  goalType,
  className = "",
}: {
  content: string;
  goal?: number | null;
  goalType?: string | null;
  className?: string;
}) {
  const target = goal || 0;
  const type = goalType === "words" || goalType === "characters" ? goalType : "";
  const { wordCount, charCount, readingTime, pageEstimate, progressPercentage } =
    useNoteStatistics(content || "", "novel", target > 0 ? { target, type } : null);

  return (
    <span
      className={`text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] ${className}`}
    >
      <span title={`${wordCount} words`}>{wordCount}w</span> ·{" "}
      <span title={`${charCount} characters`}>{charCount}c</span> ·{" "}
      <span title="Estimated reading time">{readingTime}</span> ·{" "}
      <span title="Estimated pages">{pageEstimate}</span>
      {target > 0 && type && (
        <>
          {" "}
          · <span title="Owner's writing goal">{Math.round(progressPercentage)}% of {target} {type}</span>
        </>
      )}
    </span>
  );
}
