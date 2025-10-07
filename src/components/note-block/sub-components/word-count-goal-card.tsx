import React from "react";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface WordCountGoalCardProps {
  goal: WordCountGoal | null;
  progress: number;
  onClick: () => void;
  isPrivate: boolean;
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
}: WordCountGoalCardProps) {
  const hasGoal = goal && goal.target > 0 && goal.type !== "";

  return (
    <div
      className="p-3 col-span-4 rounded-xl border border-neutral-400 cursor-pointer bg-neutral-200 hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out"
      onClick={onClick}
    >
      {hasGoal ? (
        <div className="flex flex-col items-center w-full">
          <div className="w-full bg-neutral-500 rounded-full h-4 mb-1 overflow-hidden">
            <div
              className={`h-4 rounded-full ${
                isPrivate ? "bg-violet-600" : "bg-mercedes-primary"
              } shadow-lg shadow-neutral-500 transition-all duration-300 ease-in-out`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="text-center text-sm">
            {progress}% of {goal.target}{" "}
            {goal.type === "words" ? "words" : "characters"}
            {progress >= 100 && (
              <span className="text-green-600 ml-1">✓ Completed!</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="text-center text-base">Set Word Goal</span>
        </div>
      )}
    </div>
  );
}
