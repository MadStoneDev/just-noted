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
      className={`p-3 col-span-12 sm:col-span-4 md:col-span-3 3xl:col-span-2 grid grid-cols-4 sm:flex sm:flex-col justify-start gap-3 rounded-xl ${
        isPrivate ? "bg-violet-100/50" : "bg-neutral-100"
      }`}
    >
      {/* Table of Contents - at the top */}
      <TocCard isPrivate={isPrivate} onScrollToHeading={onScrollToHeading} />

      {/* Divider */}
      <div className={`col-span-4 h-px ${isPrivate ? "bg-violet-200" : "bg-neutral-200"}`} />

      {/* Stats row - word count, char count, reading time */}
      <div className={`col-span-4 grid grid-cols-3 rounded-xl ${
        isPrivate ? "bg-violet-50" : "bg-white"
      }`}>
        <StatCard label="words" value={wordCount} isPrivate={isPrivate} />
        <StatCard label="chars" value={charCount} isPrivate={isPrivate} />
        <StatCard label="read" value={readingTime} isPrivate={isPrivate} />
      </div>

      {/* Page Estimate - actionable */}
      <PageEstimateCard
        pageEstimate={pageEstimate}
        currentFormat={currentPageFormat}
        onClick={onOpenPageEstimateModal}
        isPrivate={isPrivate}
      />

      {/* Word Count Goal - actionable */}
      <WordCountGoalCard
        goal={wordCountGoal}
        progress={progressPercentage}
        onClick={onOpenWordCountGoalModal}
        isPrivate={isPrivate}
      />
    </div>
  );
}
