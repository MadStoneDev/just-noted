"use client";

import React, { useState, useEffect } from "react";
import {
  IconSparkles,
  IconX,
  IconAlertCircle,
  IconLoader,
  IconInfoCircle,
  IconPlus,
  IconArrowsSort,
  IconList,
  IconCheck,
  IconChevronUp,
  IconChevronDown,
} from "@tabler/icons-react";
import { useAIAnalysis, AIAnalysisResult } from "@/hooks/use-ai-analysis";
import { CombinedNote } from "@/types/combined-notes";

interface AIAnalysisButtonProps {
  userId: string | null;
  note: CombinedNote;
  isPrivate?: boolean;
  onReplaceContent?: (content: string) => void;
  onInsertAtTop?: (content: string) => void;
  onInsertAtBottom?: (content: string) => void;
}

/**
 * AI Pattern Detection button with inline action buttons
 */
export default function AIAnalysisButton({
  userId,
  note,
  isPrivate = false,
  onReplaceContent,
}: AIAnalysisButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [patternResult, setPatternResult] = useState<AIAnalysisResult | null>(null);
  const [isReversing, setIsReversing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const {
    isAnalyzing,
    result,
    error,
    remaining,
    analyzeNote,
    checkRateLimit,
    clearResult,
    getResetTimeDisplay,
    dailyLimit,
  } = useAIAnalysis(userId);

  // Update pattern result when analysis completes
  useEffect(() => {
    if (result) {
      setPatternResult(result);
    }
  }, [result]);

  // Check rate limit when modal opens
  useEffect(() => {
    if (userId && showModal) {
      checkRateLimit();
    }
  }, [userId, showModal, checkRateLimit]);

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleAnalyze = async () => {
    const analysisResult = await analyzeNote(note);
    if (analysisResult?.patternFound) {
      // Keep modal open briefly to show success, then close
      setTimeout(() => {
        setShowModal(false);
      }, 1500);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    clearResult();
  };

  const handleClearPattern = () => {
    setPatternResult(null);
    clearResult();
  };

  // Insert template at top of note
  const handleRepeatAtTop = () => {
    if (!patternResult?.template || !onReplaceContent) return;

    const newContent = patternResult.template + "\n\n\n\n" + note.content;
    onReplaceContent(newContent);
    setActionFeedback("Added at top!");
    setTimeout(() => setActionFeedback(null), 2000);
  };

  // Insert template at bottom of note
  const handleRepeatAtBottom = () => {
    if (!patternResult?.template || !onReplaceContent) return;

    const newContent = note.content + "\n\n\n\n" + patternResult.template;
    onReplaceContent(newContent);
    setActionFeedback("Added at bottom!");
    setTimeout(() => setActionFeedback(null), 2000);
  };

  // Reverse order of entries
  const handleReverseOrder = async () => {
    if (!userId || !onReplaceContent || !patternResult) return;

    setIsReversing(true);

    try {
      const response = await fetch("/api/ai/reverse-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          noteContent: note.content,
          patternName: patternResult.patternName,
          entryCount: patternResult.entryCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setActionFeedback(data.error || "Failed to reverse");
        setTimeout(() => setActionFeedback(null), 3000);
        return;
      }

      if (data.reversedContent) {
        onReplaceContent(data.reversedContent);
        setActionFeedback("Reversed!");
        setTimeout(() => setActionFeedback(null), 2000);
      }
    } catch (error) {
      console.error("Reverse error:", error);
      setActionFeedback("Error reversing");
      setTimeout(() => setActionFeedback(null), 3000);
    } finally {
      setIsReversing(false);
    }
  };

  const buttonBaseClass = `group px-2 cursor-pointer flex items-center justify-center gap-1 h-10 rounded-lg border transition-all duration-300 ease-in-out`;
  const privateButtonClass = "border-violet-800 hover:bg-violet-800 hover:text-neutral-100";
  const defaultButtonClass = "border-purple-500 hover:bg-purple-500 hover:text-white text-purple-600";

  return (
    <>
      {/* Main AI Button */}
      <button
        onClick={handleOpenModal}
        disabled={!userId}
        className={`${buttonBaseClass} min-w-10 ${
          isPrivate ? privateButtonClass : defaultButtonClass
        } ${!userId ? "opacity-50 cursor-not-allowed" : ""}`}
        title={userId ? "Detect patterns in this note" : "Sign in to use AI features"}
      >
        <IconSparkles size={20} strokeWidth={2} />
        <span className="hidden sm:inline text-sm">
          {patternResult?.patternFound ? `${patternResult.entryCount} entries` : "Patterns"}
        </span>
      </button>

      {/* Pattern Action Buttons - shown when pattern is detected */}
      {patternResult?.patternFound && onReplaceContent && (
        <>
          {/* Repeat at Top */}
          <button
            onClick={handleRepeatAtTop}
            className={`${buttonBaseClass} text-sm px-3 ${
              isPrivate
                ? "border-violet-600 hover:bg-violet-600 hover:text-white text-violet-700"
                : "border-green-500 hover:bg-green-500 hover:text-white text-green-600"
            }`}
            title="Add new entry at the top"
          >
            <IconChevronUp size={16} />
            <span className="hidden md:inline">Top</span>
          </button>

          {/* Repeat at Bottom */}
          <button
            onClick={handleRepeatAtBottom}
            className={`${buttonBaseClass} text-sm px-3 ${
              isPrivate
                ? "border-violet-600 hover:bg-violet-600 hover:text-white text-violet-700"
                : "border-green-500 hover:bg-green-500 hover:text-white text-green-600"
            }`}
            title="Add new entry at the bottom"
          >
            <IconChevronDown size={16} />
            <span className="hidden md:inline">Bottom</span>
          </button>

          {/* Reverse Order */}
          <button
            onClick={handleReverseOrder}
            disabled={isReversing}
            className={`${buttonBaseClass} text-sm px-3 ${
              isPrivate
                ? "border-violet-600 hover:bg-violet-600 hover:text-white text-violet-700"
                : "border-amber-500 hover:bg-amber-500 hover:text-white text-amber-600"
            } disabled:opacity-50`}
            title="Reverse order of entries"
          >
            {isReversing ? (
              <IconLoader size={16} className="animate-spin" />
            ) : (
              <IconArrowsSort size={16} />
            )}
            <span className="hidden md:inline">Reverse</span>
          </button>

          {/* Clear Pattern */}
          <button
            onClick={handleClearPattern}
            className={`${buttonBaseClass} text-sm px-2 border-neutral-300 hover:bg-neutral-200 text-neutral-500`}
            title="Clear pattern detection"
          >
            <IconX size={14} />
          </button>
        </>
      )}

      {/* Action Feedback Toast */}
      {actionFeedback && (
        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full animate-pulse">
          {actionFeedback}
        </span>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/30 pt-20 sm:pt-0 px-2"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] sm:max-h-[80vh] flex flex-col mx-2 sm:mx-4 mt-4 sm:mt-0">
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-neutral-200 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <IconSparkles size={18} className="text-purple-500 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 id="ai-modal-title" className="text-base sm:text-lg font-semibold">
                    Pattern Detection
                  </h2>
                  <p className="text-xs text-neutral-500 truncate max-w-[200px] sm:max-w-[250px]">
                    {note.title}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors flex-shrink-0"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {!result && !isAnalyzing && !error ? (
                <PreAnalysisView
                  remaining={remaining}
                  dailyLimit={dailyLimit}
                  resetTime={getResetTimeDisplay()}
                  onAnalyze={handleAnalyze}
                  isDisabled={remaining === 0}
                  hasExistingPattern={!!patternResult?.patternFound}
                />
              ) : isAnalyzing ? (
                <LoadingView />
              ) : error ? (
                <ErrorView
                  error={error}
                  onRetry={handleAnalyze}
                  canRetry={remaining > 0}
                />
              ) : result ? (
                <ResultsView result={result} />
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-neutral-200 text-xs text-neutral-500 flex items-center justify-between flex-shrink-0">
              <span>
                {remaining}/{dailyLimit} analyses remaining
              </span>
              {remaining === 0 && (
                <span>Resets {getResetTimeDisplay()}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Pre-analysis view
function PreAnalysisView({
  remaining,
  dailyLimit,
  resetTime,
  onAnalyze,
  isDisabled,
  hasExistingPattern,
}: {
  remaining: number;
  dailyLimit: number;
  resetTime: string | null;
  onAnalyze: () => void;
  isDisabled: boolean;
  hasExistingPattern: boolean;
}) {
  return (
    <div className="space-y-4">
      {hasExistingPattern && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-green-700">
            <IconCheck size={16} />
            <span>Pattern already detected! Use the toolbar buttons to take action.</span>
          </div>
        </div>
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <IconInfoCircle size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-purple-900 text-sm">What is Pattern Detection?</h3>
            <p className="text-xs text-purple-700 mt-1">
              AI scans your note for repeating structures - like entries that follow the same format.
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <IconList size={16} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <span>Detects repeating entries (logs, notes, records)</span>
        </li>
        <li className="flex items-start gap-2">
          <IconPlus size={16} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <span>Enables quick actions: repeat at top/bottom, reverse order</span>
        </li>
      </ul>

      {remaining === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-amber-900">Daily limit reached</p>
          {resetTime && (
            <p className="text-amber-700 text-xs mt-1">Resets in {resetTime}</p>
          )}
        </div>
      ) : (
        <div className="text-xs text-neutral-500">
          {remaining} of {dailyLimit} analyses available today
        </div>
      )}

      <button
        onClick={onAnalyze}
        disabled={isDisabled}
        className="w-full py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
      >
        <IconSparkles size={16} />
        {isDisabled ? "Come back tomorrow" : hasExistingPattern ? "Re-analyze" : "Detect Patterns"}
      </button>
    </div>
  );
}

// Loading view
function LoadingView() {
  return (
    <div className="py-8 text-center">
      <IconLoader size={32} className="animate-spin text-purple-500 mx-auto mb-3" />
      <p className="text-neutral-600 font-medium text-sm">Scanning for patterns...</p>
    </div>
  );
}

// Error view
function ErrorView({
  error,
  onRetry,
  canRetry,
}: {
  error: string;
  onRetry: () => void;
  canRetry: boolean;
}) {
  return (
    <div className="py-6 text-center">
      <IconAlertCircle size={32} className="text-red-500 mx-auto mb-3" />
      <p className="text-neutral-800 font-medium text-sm">Analysis Failed</p>
      <p className="text-xs text-neutral-600 mt-1">{error}</p>
      {canRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors text-sm"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// Results view (simplified - just shows info, actions are in toolbar)
function ResultsView({ result }: { result: AIAnalysisResult }) {
  const [showIndex, setShowIndex] = useState(false);

  if (!result.patternFound) {
    return (
      <div className="py-6 text-center">
        <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <IconList size={24} className="text-neutral-400" />
        </div>
        <p className="text-neutral-800 font-medium text-sm">No Pattern Detected</p>
        <p className="text-xs text-neutral-600 mt-1">
          This note doesn't have repeating entries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pattern Found Banner */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <IconCheck size={18} className="text-green-600" />
          <div>
            <p className="font-medium text-green-800 text-sm">
              {result.patternName || "Pattern Found"}
            </p>
            <p className="text-xs text-green-700">
              {result.entryCount} entries detected
            </p>
          </div>
        </div>
      </div>

      {/* Fields */}
      {result.fields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-600 mb-1.5">Fields:</p>
          <div className="flex flex-wrap gap-1.5">
            {result.fields.map((field, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Index Toggle */}
      <button
        onClick={() => setShowIndex(!showIndex)}
        className="w-full p-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <IconList size={16} />
        {showIndex ? "Hide Index" : "Show Index"}
      </button>

      {/* Index */}
      {showIndex && result.entries.length > 0 && (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <ul className="divide-y divide-neutral-100 max-h-32 overflow-y-auto text-xs">
            {result.entries.map((entry) => (
              <li key={entry.index} className="px-2 py-1.5 hover:bg-neutral-50">
                <span className="text-neutral-400 mr-2">{entry.index}.</span>
                <span className="text-neutral-700">{entry.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Template Preview */}
      {result.template && (
        <div>
          <p className="text-xs font-medium text-neutral-600 mb-1.5">Template:</p>
          <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs text-neutral-600 whitespace-pre-wrap overflow-x-auto max-h-24">
            {result.template}
          </pre>
        </div>
      )}

      <p className="text-xs text-neutral-500 text-center">
        Use the toolbar buttons to add entries or reverse order.
      </p>
    </div>
  );
}
