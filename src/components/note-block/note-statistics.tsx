import React from "react";
import StatCard from "./sub-components/stat-card";
import PageEstimateCard from "./sub-components/page-estimate-card";
import TocCard from "./sub-components/toc-card";
import WordCountGoalCard from "./sub-components/word-count-goal-card";
import { TocHeading } from "@/lib/toc-parser";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
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
  onOpenPageEstimateModal: () => void;
  onOpenWordCountGoalModal: () => void;
  onScrollToHeading: (heading: TocHeading) => void;
}

/**
 * Note statistics sidebar component
 * Displays word count, character count, reading time, page estimate, and goal progress
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
  onOpenPageEstimateModal,
  onOpenWordCountGoalModal,
  onScrollToHeading,
}: NoteStatisticsProps) {
  return (
    <div
      className={`p-4 col-span-12 sm:col-span-4 md:col-span-3 3xl:col-span-2 grid grid-cols-4 sm:flex sm:flex-col justify-start gap-2 bg-neutral-300 rounded-xl text-neutral-500/70 font-normal capitalize`}
    >
      {/* Word Count */}
      <StatCard label="words" value={wordCount} isPrivate={isPrivate} />

      {/* Character Count */}
      <StatCard label="characters" value={charCount} isPrivate={isPrivate} />

      {/* Reading Time */}
      <StatCard label="read time" value={readingTime} isPrivate={isPrivate} />

      {/* Page Estimate */}
      <PageEstimateCard
        pageEstimate={pageEstimate}
        currentFormat={currentPageFormat}
        onClick={onOpenPageEstimateModal}
        isPrivate={isPrivate}
      />

      {/* Table of Contents */}
      <TocCard isPrivate={isPrivate} onScrollToHeading={onScrollToHeading} />

      {/* Word Count Goal */}
      <WordCountGoalCard
        goal={wordCountGoal}
        progress={progressPercentage}
        onClick={onOpenWordCountGoalModal}
        isPrivate={isPrivate}
      />
    </div>
  );
}
