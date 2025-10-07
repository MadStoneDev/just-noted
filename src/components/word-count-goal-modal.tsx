// src/components/word-count-goal-modal.tsx
"use client";

import React, { useState, useCallback, useMemo } from "react";
import { IconLetterCase, IconLetterCaseToggle } from "@tabler/icons-react";
import { Modal } from "@/components/ui/modal";

interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface WordCountGoalModalProps {
  isOpen: boolean;
  currentGoal: WordCountGoal | { target: 0; type: "" };
  onGoalChange: (goal: WordCountGoal | null) => void;
  onClose: () => void;
  currentWordCount: number;
  currentCharCount: number;
}

export default function WordCountGoalModal({
  isOpen,
  currentGoal,
  onGoalChange,
  onClose,
  currentWordCount,
  currentCharCount,
}: WordCountGoalModalProps) {
  const [goalType, setGoalType] = useState<"words" | "characters">(
    currentGoal?.type || "words",
  );
  const [targetValue, setTargetValue] = useState<number | "">(
    currentGoal?.target || "",
  );

  const handleTypeChange = useCallback((type: "words" | "characters") => {
    setGoalType(type);
  }, []);

  const handleTargetChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === "") {
        setTargetValue("");
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 0) {
          setTargetValue(numValue);
        }
      }
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (targetValue === "") {
      onGoalChange(null);
    } else {
      onGoalChange({
        target: targetValue as number,
        type: goalType,
      });
    }
    onClose();
  }, [targetValue, goalType, onGoalChange, onClose]);

  const handleClearGoal = useCallback(() => {
    onGoalChange(null);
    onClose();
  }, [onGoalChange, onClose]);

  // Memoize progress calculations
  const { currentCount, remaining } = useMemo(() => {
    const count = goalType === "words" ? currentWordCount : currentCharCount;
    const rem =
      targetValue !== "" ? Math.max(0, (targetValue as number) - count) : 0;
    return { currentCount: count, remaining: rem };
  }, [goalType, currentWordCount, currentCharCount, targetValue]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Writing Goal" size="md">
      <p className="text-neutral-600 mb-4">
        Set a target word or character count for your writing:
      </p>

      <div className="space-y-4">
        {/* Type Selection */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <GoalTypeButton
              type="words"
              icon={<IconLetterCase size={20} />}
              label="Words"
              isActive={goalType === "words"}
              onClick={handleTypeChange}
            />
            <GoalTypeButton
              type="characters"
              icon={<IconLetterCaseToggle size={20} />}
              label="Characters"
              isActive={goalType === "characters"}
              onClick={handleTypeChange}
            />
          </div>
        </div>

        {/* Target Input */}
        <div>
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

        {/* Progress Info */}
        <div className="text-sm text-neutral-500 space-y-1">
          <p>
            Current progress: {currentCount} {goalType}
          </p>
          {targetValue !== "" && (
            <p>
              {remaining} {goalType} remaining
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-2">
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
    </Modal>
  );
}

// Extracted button component
const GoalTypeButton = React.memo(function GoalTypeButton({
  type,
  icon,
  label,
  isActive,
  onClick,
}: {
  type: "words" | "characters";
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: (type: "words" | "characters") => void;
}) {
  const handleClick = useCallback(() => {
    onClick(type);
  }, [type, onClick]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`px-4 py-2 text-sm font-medium ${
        type === "words" ? "rounded-l-lg" : "rounded-r-lg"
      } border ${
        isActive
          ? "bg-mercedes-primary text-white border-mercedes-primary"
          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
    </button>
  );
});
