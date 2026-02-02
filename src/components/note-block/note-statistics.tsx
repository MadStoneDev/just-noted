import React from "react";
import StatCard from "./sub-components/stat-card";
import PageEstimateCard from "./sub-components/page-estimate-card";
import TocCard from "./sub-components/toc-card";
import WordCountGoalCard from "./sub-components/word-count-goal-card";
import { TocHeading } from "@/lib/toc-parser";
import { getCoverStyle } from "@/lib/notebook-covers";
import { CoverType } from "@/types/notebook";
import { IconNotebook } from "@tabler/icons-react";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface NotebookInfo {
  name: string;
  coverType: CoverType;
  coverValue: string;
}

interface NoteStatisticsProps {
  wordCount: number;
  charCount: number;
  readingTime: string;
  pageEstimate: string;
  currentPageFormat: string;
  progressPercentage: number;
  wordCountGoal: WordCountGoal | null;
  isPrivate: boolean;
  notebook?: NotebookInfo | null;
  onOpenPageEstimateModal: () => void;
  onOpenWordCountGoalModal: () => void;
  onScrollToHeading: (heading: TocHeading) => void;
}

/**
 * Note statistics sidebar component
 * Displays word count, character count, reading time, page estimate, and goal progress
 * When note is in a notebook, applies the notebook cover as background
 */
export default function NoteStatistics({
  wordCount,
  charCount,
  readingTime,
  pageEstimate,
  currentPageFormat,
  progressPercentage,
  wordCountGoal,
  isPrivate,
  notebook,
  onOpenPageEstimateModal,
  onOpenWordCountGoalModal,
  onScrollToHeading,
}: NoteStatisticsProps) {
  // Get background style based on notebook cover or default
  const getBackgroundStyle = (): React.CSSProperties => {
    if (notebook) {
      const coverStyle = getCoverStyle(notebook.coverType, notebook.coverValue, { faded: true });
      return {
        ...coverStyle,
        // Add slight opacity overlay for readability
      };
    }
    return {};
  };

  const hasNotebookCover = !!notebook;
  const baseClasses = "p-3 col-span-12 sm:col-span-4 md:col-span-3 3xl:col-span-2 grid grid-cols-4 sm:flex sm:flex-col justify-start gap-3 rounded-xl relative overflow-hidden";

  return (
    <div
      className={`${baseClasses} ${
        hasNotebookCover
          ? ""
          : isPrivate
            ? "bg-violet-100/50"
            : "bg-neutral-100"
      }`}
      style={getBackgroundStyle()}
    >
      {/* Overlay for readability when notebook cover is applied */}
      {hasNotebookCover && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      )}

      {/* Content wrapper for z-index */}
      <div className={`relative z-10 col-span-4 sm:contents ${hasNotebookCover ? "text-white" : ""}`}>
        {/* In Notebook indicator */}
        {notebook && (
          <>
            <div className={`col-span-4 flex flex-col items-center gap-1 py-2 rounded-lg ${
              hasNotebookCover ? "bg-neutral-900/50" : ""
            }`}>
              <div className={`flex items-center gap-1.5 text-xs uppercase tracking-wide ${
                hasNotebookCover ? "text-neutral-200" : "opacity-80"
              }`}>
                <IconNotebook size={14} />
                <span>In Notebook</span>
              </div>
              <span className={`font-medium text-sm text-center ${
                hasNotebookCover ? "text-white" : ""
              }`}>{notebook.name}</span>
            </div>

            {/* Divider */}
            <div className={`col-span-4 h-px ${hasNotebookCover ? "bg-white/30" : isPrivate ? "bg-violet-200" : "bg-neutral-200"}`} />
          </>
        )}

        {/* Table of Contents - at the top */}
        <TocCard isPrivate={isPrivate} onScrollToHeading={onScrollToHeading} hasNotebookCover={hasNotebookCover} />

        {/* Divider */}
        <div className={`col-span-4 h-px ${hasNotebookCover ? "bg-white/30" : isPrivate ? "bg-violet-200" : "bg-neutral-200"}`} />

        {/* Stats row - word count, char count, reading time */}
        <div className={`col-span-4 flex flex-col lg:flex-row items-center rounded-xl ${
          hasNotebookCover
            ? "bg-neutral-900/50"
            : isPrivate
              ? "bg-violet-50"
              : "bg-white"
        }`}>
          <StatCard label="words" value={wordCount} isPrivate={isPrivate} hasNotebookCover={hasNotebookCover} />
          <StatCard label="chars" value={charCount} isPrivate={isPrivate} hasNotebookCover={hasNotebookCover} />
          <StatCard label="read" value={readingTime} isPrivate={isPrivate} hasNotebookCover={hasNotebookCover} />
        </div>

        {/* Page Estimate - actionable */}
        <PageEstimateCard
          pageEstimate={pageEstimate}
          currentFormat={currentPageFormat}
          onClick={onOpenPageEstimateModal}
          isPrivate={isPrivate}
          hasNotebookCover={hasNotebookCover}
        />

        {/* Word Count Goal - actionable */}
        <WordCountGoalCard
          goal={wordCountGoal}
          progress={progressPercentage}
          onClick={onOpenWordCountGoalModal}
          isPrivate={isPrivate}
          hasNotebookCover={hasNotebookCover}
        />
      </div>
    </div>
  );
}
