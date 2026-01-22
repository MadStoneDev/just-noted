"use client";

import React, { useState, useEffect } from "react";
import {
  IconSparkles,
  IconX,
  IconBulb,
  IconTemplate,
  IconFileText,
  IconAlertCircle,
  IconLoader,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useAIAnalysis, AIAnalysisResult, PatternResult } from "@/hooks/use-ai-analysis";
import { CombinedNote } from "@/types/combined-notes";

interface AIAnalysisButtonProps {
  userId: string | null;
  notes: CombinedNote[];
  currentNoteId?: string;
  onCreateTemplate?: (content: string, name: string) => void;
}

/**
 * AI Analysis button with explanation and results modal
 */
export default function AIAnalysisButton({
  userId,
  notes,
  currentNoteId,
  onCreateTemplate,
}: AIAnalysisButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);

  const {
    isAnalyzing,
    result,
    error,
    remaining,
    analyzePatterns,
    checkRateLimit,
    clearResult,
    getResetTimeDisplay,
    dailyLimit,
  } = useAIAnalysis(userId);

  // Check rate limit on mount
  useEffect(() => {
    if (userId && showModal) {
      checkRateLimit();
    }
  }, [userId, showModal, checkRateLimit]);

  const handleOpenModal = () => {
    setShowModal(true);
    // Show explanation first time, then go straight to analysis
    if (result) {
      setShowExplanation(false);
    }
  };

  const handleAnalyze = async () => {
    setShowExplanation(false);
    await analyzePatterns(notes, currentNoteId);
  };

  const handleClose = () => {
    setShowModal(false);
    // Don't clear result so user can reopen and see it
  };

  const handleCreateTemplate = (pattern: PatternResult) => {
    if (pattern.suggestedTemplate && onCreateTemplate) {
      onCreateTemplate(pattern.suggestedTemplate, pattern.name);
      handleClose();
    }
  };

  return (
    <>
      {/* AI Button */}
      <button
        onClick={handleOpenModal}
        disabled={!userId}
        className={`group/ai px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 border-purple-500 hover:bg-purple-500 hover:text-white text-purple-600 overflow-hidden transition-all duration-300 ease-in-out ${
          !userId ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title={userId ? "AI Pattern Analysis" : "Sign in to use AI features"}
      >
        <IconSparkles size={20} strokeWidth={2} />
        <span className="w-fit max-w-0 sm:group-hover/ai:max-w-52 opacity-0 md:group-hover/ai:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap">
          AI Analysis
        </span>
        {remaining < dailyLimit && remaining > 0 && (
          <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
            {remaining}
          </span>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <IconSparkles size={20} className="text-purple-500" />
                <h2 id="ai-modal-title" className="text-lg font-semibold">
                  AI Pattern Analysis
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {showExplanation && !result ? (
                <ExplanationView
                  remaining={remaining}
                  dailyLimit={dailyLimit}
                  resetTime={getResetTimeDisplay()}
                  onAnalyze={handleAnalyze}
                  isDisabled={remaining === 0 || isAnalyzing}
                />
              ) : isAnalyzing ? (
                <LoadingView />
              ) : error ? (
                <ErrorView error={error} onRetry={handleAnalyze} canRetry={remaining > 0} />
              ) : result ? (
                <ResultsView
                  result={result}
                  onCreateTemplate={handleCreateTemplate}
                  onAnalyzeAgain={() => setShowExplanation(true)}
                  remaining={remaining}
                />
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-200 text-xs text-neutral-500 flex items-center justify-between">
              <span>
                {remaining}/{dailyLimit} analyses remaining today
              </span>
              {remaining === 0 && (
                <span>Resets in {getResetTimeDisplay()}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Explanation view shown before first analysis
function ExplanationView({
  remaining,
  dailyLimit,
  resetTime,
  onAnalyze,
  isDisabled,
}: {
  remaining: number;
  dailyLimit: number;
  resetTime: string | null;
  onAnalyze: () => void;
  isDisabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <IconInfoCircle size={24} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-purple-900">What does AI Analysis do?</h3>
            <p className="text-sm text-purple-700 mt-1">
              AI Analysis uses Claude (an AI assistant) to scan your notes and identify:
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-3 ml-2">
        <li className="flex items-start gap-3">
          <IconTemplate size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Repetitive Structures</span>
            <p className="text-sm text-neutral-600">
              Patterns like weekly reports, meeting notes, or daily logs that could become templates
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconFileText size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Similar Notes</span>
            <p className="text-sm text-neutral-600">
              Notes with similar content or structure to help you organize
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconBulb size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Organization Tips</span>
            <p className="text-sm text-neutral-600">
              Suggestions for better organizing and categorizing your notes
            </p>
          </div>
        </li>
      </ul>

      {remaining === 0 ? (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-3">
            <IconSparkles size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-purple-900">You've used all your analyses for today!</p>
              <p className="text-purple-700 mt-1">
                Come back tomorrow for more. We're working on expanded AI features with more capabilities coming soon!
              </p>
              {resetTime && (
                <p className="text-purple-600 mt-2 text-xs">Resets in {resetTime}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-neutral-600">
            <IconInfoCircle size={16} />
            <span>
              You have <strong>{remaining} of {dailyLimit}</strong> analyses available today.
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onAnalyze}
        disabled={isDisabled}
        className="w-full py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <IconSparkles size={18} />
        {remaining === 0 ? "Come back tomorrow" : "Analyze My Notes"}
      </button>
    </div>
  );
}

// Loading view during analysis
function LoadingView() {
  return (
    <div className="py-12 text-center">
      <IconLoader size={40} className="animate-spin text-purple-500 mx-auto mb-4" />
      <p className="text-neutral-600 font-medium">Analyzing your notes...</p>
      <p className="text-sm text-neutral-500 mt-1">This may take a few seconds</p>
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
    <div className="py-8 text-center">
      <IconAlertCircle size={40} className="text-red-500 mx-auto mb-4" />
      <p className="text-neutral-800 font-medium">Analysis Failed</p>
      <p className="text-sm text-neutral-600 mt-1">{error}</p>
      {canRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// Results view
function ResultsView({
  result,
  onCreateTemplate,
  onAnalyzeAgain,
  remaining,
}: {
  result: AIAnalysisResult;
  onCreateTemplate: (pattern: PatternResult) => void;
  onAnalyzeAgain: () => void;
  remaining: number;
}) {
  return (
    <div className="space-y-6">
      {/* Patterns */}
      {result.patterns.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-3 flex items-center gap-2">
            <IconTemplate size={18} className="text-purple-500" />
            Detected Patterns
          </h3>
          <div className="space-y-3">
            {result.patterns.map((pattern, index) => (
              <div
                key={index}
                className="bg-purple-50 border border-purple-200 rounded-lg p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium text-purple-900">{pattern.name}</span>
                    <span className="ml-2 text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                      {pattern.frequency}
                    </span>
                  </div>
                  {pattern.suggestedTemplate && (
                    <button
                      onClick={() => onCreateTemplate(pattern)}
                      className="text-xs bg-purple-500 text-white px-2 py-1 rounded hover:bg-purple-600 transition-colors"
                    >
                      Create Template
                    </button>
                  )}
                </div>
                <p className="text-sm text-purple-700 mt-1">{pattern.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar Notes */}
      {result.similarNotes.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-3 flex items-center gap-2">
            <IconFileText size={18} className="text-purple-500" />
            Similar Notes Found
          </h3>
          <ul className="space-y-2">
            {result.similarNotes.map((note, index) => (
              <li key={index} className="bg-neutral-50 rounded-lg p-3">
                <span className="font-medium">{note.noteTitle}</span>
                <p className="text-sm text-neutral-600 mt-0.5">{note.similarity}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-3 flex items-center gap-2">
            <IconBulb size={18} className="text-purple-500" />
            Suggestions
          </h3>
          <ul className="space-y-2">
            {result.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="text-purple-500 mt-1">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results */}
      {result.patterns.length === 0 &&
        result.similarNotes.length === 0 &&
        result.suggestions.length === 0 && (
          <div className="py-8 text-center text-neutral-500">
            <p>No significant patterns detected in your notes.</p>
            <p className="text-sm mt-1">
              Try again after adding more notes with similar structures.
            </p>
          </div>
        )}

      {/* Analyze Again */}
      {remaining > 0 && (
        <button
          onClick={onAnalyzeAgain}
          className="w-full py-2 border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
        >
          Analyze Again ({remaining} remaining)
        </button>
      )}
    </div>
  );
}
