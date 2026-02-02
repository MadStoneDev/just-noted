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
        className={`group col-span-4 p-3 rounded-xl transition-all duration-200 ${
          hasNotebookCover
            ? "bg-neutral-50/70 hover:bg-neutral-50/90"
            : isPrivate
              ? "bg-violet-50 hover:bg-violet-100"
              : "bg-neutral-50 hover:bg-neutral-100"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconTarget size={16} className={hasNotebookCover ? "text-neutral-600" : isPrivate ? "text-violet-600" : "text-neutral-500"} />
            <span className={`text-xs font-medium uppercase tracking-wide ${
              hasNotebookCover ? "text-neutral-600" : "text-neutral-600"
            }`}>
              Goal Progress
            </span>
          </div>
          {isComplete && (
            <div className={`flex items-center gap-1 ${hasNotebookCover ? "text-green-600" : "text-green-600"}`}>
              <IconCheck size={14} />
              <span className="text-xs font-medium">Done!</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className={`w-full h-2 rounded-full overflow-hidden ${
          hasNotebookCover
            ? "bg-neutral-300"
            : isPrivate
              ? "bg-violet-200"
              : "bg-neutral-200"
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isComplete
                ? "bg-green-500"
                : hasNotebookCover
                  ? "bg-mercedes-primary"
                  : isPrivate
                    ? "bg-violet-500"
                    : "bg-mercedes-primary"
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Stats */}
        <div className={`mt-2 flex items-center justify-between text-xs ${hasNotebookCover ? "text-neutral-600" : "text-neutral-500"}`}>
          <span className="font-semibold text-sm">
            <span className={hasNotebookCover ? "text-neutral-800" : isPrivate ? "text-violet-700" : "text-neutral-800"}>{progress}%</span>
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
      className={`group col-span-4 flex items-center justify-center gap-2 p-3 rounded-xl transition-all duration-200 ${
        hasNotebookCover
          ? "bg-neutral-50/70 hover:bg-neutral-50/90 text-neutral-700"
          : isPrivate
            ? "border-2 border-dashed border-violet-300 hover:border-violet-500 hover:bg-violet-50 text-violet-600"
            : "border-2 border-dashed border-neutral-300 hover:border-mercedes-primary hover:bg-mercedes-primary/5 text-neutral-500"
      }`}
    >
      <div className={`p-1.5 rounded-full ${
        hasNotebookCover
          ? "bg-neutral-700 text-neutral-200"
          : isPrivate
            ? "bg-violet-100"
            : "bg-neutral-100"
      } group-hover:scale-110 transition-transform`}>
        <IconPlus size={14} />
      </div>
      <span className="text-sm font-medium">Set Word Goal</span>
    </button>
  );
}
