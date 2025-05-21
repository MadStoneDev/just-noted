import React, { useState } from "react";
import {
  IconX,
  IconLetterCase,
  IconLetterCaseToggle,
} from "@tabler/icons-react";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface WordCountGoalModalProps {
  currentGoal: WordCountGoal | { target: 0; type: "" };
  onGoalChange: (goal: WordCountGoal | null) => void;
  onClose: () => void;
  currentWordCount: number;
  currentCharCount: number;
}

const WordCountGoalModal: React.FC<WordCountGoalModalProps> = ({
  currentGoal,
  onGoalChange,
  onClose,
  currentWordCount,
  currentCharCount,
}) => {
  const [goalType, setGoalType] = useState<"words" | "characters">(
    currentGoal?.type || "words",
  );
  const [targetValue, setTargetValue] = useState<number | "">(
    currentGoal?.target || "",
  );

  const handleTypeChange = (type: "words" | "characters") => {
    setGoalType(type);
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      setTargetValue("");
    } else {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        setTargetValue(numValue);
      }
    }
  };

  const handleSave = () => {
    if (targetValue === "") {
      // If no value is set, clear the goal
      onGoalChange(null);
    } else {
      onGoalChange({
        target: targetValue as number,
        type: goalType,
      });
    }
  };

  const handleClearGoal = () => {
    onGoalChange(null);
  };

  return (
    <div
      className={`absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50`}
    >
      <div
        className={`absolute top-0 left-0 bottom-0 right-0 bg-neutral-900 opacity-50`}
      ></div>

      <div className={`bg-white p-4 rounded-xl shadow-lg max-w-md z-50`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Set Writing Goal</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
          >
            <IconX size={20} strokeWidth={2} />
          </button>
        </div>

        <p className="text-neutral-600 mb-4">
          Set a target word or character count for your writing:
        </p>

        <div className="mb-4">
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => handleTypeChange("words")}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                  goalType === "words"
                    ? "bg-mercedes-primary text-white border-mercedes-primary"
                    : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <IconLetterCase size={20} />
                  Words
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("characters")}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg border ${
                  goalType === "characters"
                    ? "bg-mercedes-primary text-white border-mercedes-primary"
                    : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <IconLetterCaseToggle size={20} />
                  Characters
                </div>
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="targetCount"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Target Count:
            </label>
            <input
              type="number"
              id="targetCount"
              className="w-full p-2 border border-neutral-300 rounded-lg focus:ring-mercedes-primary focus:border-mercedes-primary focus:outline-none"
              value={targetValue}
              onChange={handleTargetChange}
              placeholder="Enter your target count"
              min="0"
            />
          </div>

          <div className="text-sm text-neutral-500 mb-4">
            <p>
              Current progress:{" "}
              {goalType === "words" ? currentWordCount : currentCharCount}{" "}
              {goalType}
            </p>
            {targetValue !== "" && (
              <p>
                {goalType === "words"
                  ? `${Math.max(
                      0,
                      (targetValue as number) - currentWordCount,
                    )} words remaining`
                  : `${Math.max(
                      0,
                      (targetValue as number) - currentCharCount,
                    )} characters remaining`}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-between">
          <button
            onClick={handleClearGoal}
            className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-100 transition-all duration-200"
          >
            Clear Goal
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 transition-all duration-200"
          >
            Save Goal
          </button>
        </div>
      </div>
    </div>
  );
};

export default WordCountGoalModal;
