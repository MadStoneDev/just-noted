import React from "react";
import { IconTarget, IconPlus, IconCheck } from "@tabler/icons-react";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface WordCountGoalCardProps {
  goal: WordCountGoal | null;
  progress: number;
  onClick: () => void;
  isPrivate: boolean;
  hasNotebookCover?: boolean;
}

/**
 * Word count goal card with progress bar
 * Shows progress toward word/character goal or prompt to set a goal
 */
export default function WordCountGoalCard({
  goal,
  progress,
  onClick,
  isPrivate,
  hasNotebookCover,
}: WordCountGoalCardProps) {
  const hasGoal = goal && goal.target > 0 && goal.type !== "";
  const isComplete = progress >= 100;

  if (hasGoal) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Edit word goal"
        className={`group col-span-4 p-3 rounded-[var(--radius-xl)] transition-all duration-200 ${
          hasNotebookCover
            ? "bg-[var(--color-bg-secondary)]/70 hover:bg-[var(--color-bg-secondary)]/90"
            : isPrivate
              ? "bg-violet-50 hover:bg-violet-100"
              : "bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)]"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconTarget size={16} className={hasNotebookCover ? "text-[var(--color-text-secondary)]" : isPrivate ? "text-violet-600" : "text-[var(--color-text-secondary)]"} />
            <span className={`text-xs font-medium uppercase tracking-wide ${
              hasNotebookCover ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-secondary)]"
            }`}>
              Goal Progress
            </span>
          </div>
          {isComplete && (
            <div className={`flex items-center gap-1 ${hasNotebookCover ? "text-[var(--color-success)]" : "text-[var(--color-success)]"}`}>
              <IconCheck size={14} />
              <span className="text-xs font-medium">Done!</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className={`w-full h-2 rounded-full overflow-hidden ${
          hasNotebookCover
            ? "bg-[var(--color-border-primary)]"
            : isPrivate
              ? "bg-violet-200"
              : "bg-[var(--color-bg-tertiary)]"
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isComplete
                ? "bg-[var(--color-success)]"
                : hasNotebookCover
                  ? "bg-[var(--color-accent)]"
                  : isPrivate
                    ? "bg-violet-500"
                    : "bg-[var(--color-accent)]"
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Stats */}
        <div className={`mt-2 flex items-center justify-between text-xs ${hasNotebookCover ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-secondary)]"}`}>
          <span className="font-semibold text-sm">
            <span className={hasNotebookCover ? "text-[var(--color-text-primary)]" : isPrivate ? "text-violet-700" : "text-[var(--color-text-primary)]"}>{progress}%</span>
          </span>
          <span>
            {goal.target.toLocaleString()} {goal.type === "words" ? "words" : "chars"}
          </span>
        </div>
      </button>
    );
  }

  // No goal set - show call to action
  return (
    <button
      type="button"
      onClick={onClick}
      title="Set a word goal"
      className={`group col-span-4 flex items-center justify-center gap-2 p-3 rounded-[var(--radius-xl)] transition-all duration-200 ${
        hasNotebookCover
          ? "bg-[var(--color-bg-secondary)]/70 hover:bg-[var(--color-bg-secondary)]/90 text-[var(--color-text-primary)]"
          : isPrivate
            ? "border-2 border-dashed border-violet-300 hover:border-violet-500 hover:bg-violet-50 text-violet-600"
            : "border-2 border-dashed border-[var(--color-border-primary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 text-[var(--color-text-secondary)]"
      }`}
    >
      <div className={`p-1.5 rounded-full ${
        hasNotebookCover
          ? "bg-[var(--color-text-primary)] text-[var(--color-text-tertiary)]"
          : isPrivate
            ? "bg-violet-100"
            : "bg-[var(--color-bg-tertiary)]"
      } group-hover:scale-110 transition-transform`}>
        <IconPlus size={14} />
      </div>
      <span className="text-sm font-medium">Set Word Goal</span>
    </button>
  );
}
