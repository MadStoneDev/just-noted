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
  IconCopy,
} from "@tabler/icons-react";
import { useAIAnalysis, AIAnalysisResult } from "@/hooks/use-ai-analysis";
import { CombinedNote } from "@/types/combined-notes";

interface AIAnalysisButtonProps {
  userId: string | null;
  note: CombinedNote;
  isPrivate?: boolean;
  onInsertContent?: (content: string) => void;
  onReplaceContent?: (content: string) => void;
}

/**
 * AI Pattern Detection button for a single note
 */
export default function AIAnalysisButton({
  userId,
  note,
  isPrivate = false,
  onInsertContent,
  onReplaceContent,
}: AIAnalysisButtonProps) {
  const [showModal, setShowModal] = useState(false);

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
    await analyzeNote(note);
  };

  const handleClose = () => {
    setShowModal(false);
    clearResult();
  };

  return (
    <>
      {/* AI Button - matches note toolbar style */}
      <button
        onClick={handleOpenModal}
        disabled={!userId}
        className={`group/ai px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
          isPrivate
            ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
            : "border-purple-500 hover:bg-purple-500 hover:text-white text-purple-600"
        } overflow-hidden transition-all duration-300 ease-in-out ${
          !userId ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title={userId ? "Detect patterns in this note" : "Sign in to use AI features"}
      >
        <IconSparkles size={20} strokeWidth={2} />
        <span className="w-fit max-w-0 sm:group-hover/ai:max-w-52 opacity-0 md:group-hover/ai:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap">
          Patterns
        </span>
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <IconSparkles size={20} className="text-purple-500" />
                <div>
                  <h2 id="ai-modal-title" className="text-lg font-semibold">
                    Pattern Detection
                  </h2>
                  <p className="text-xs text-neutral-500 truncate max-w-[250px]">
                    {note.title}
                  </p>
                </div>
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
              {!result && !isAnalyzing && !error ? (
                <PreAnalysisView
                  remaining={remaining}
                  dailyLimit={dailyLimit}
                  resetTime={getResetTimeDisplay()}
                  onAnalyze={handleAnalyze}
                  isDisabled={remaining === 0}
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
                <ResultsView
                  result={result}
                  note={note}
                  onInsertContent={onInsertContent}
                  onReplaceContent={onReplaceContent}
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

// Pre-analysis view
function PreAnalysisView({
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
            <h3 className="font-medium text-purple-900">What is Pattern Detection?</h3>
            <p className="text-sm text-purple-700 mt-1">
              AI will scan your note for repeating structures - like entries that follow the same format.
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-3 ml-2">
        <li className="flex items-start gap-3">
          <IconList size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Find Repeating Entries</span>
            <p className="text-sm text-neutral-600">
              Detects if your note has multiple entries following the same template
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconPlus size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Create New Entries</span>
            <p className="text-sm text-neutral-600">
              Generate a blank template to add new entries matching the pattern
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconArrowsSort size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Reorder & Index</span>
            <p className="text-sm text-neutral-600">
              Reverse order of entries or view an index of all entries
            </p>
          </div>
        </li>
      </ul>

      {remaining === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-3">
            <IconSparkles size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Daily limit reached</p>
              <p className="text-amber-700 mt-1">
                Come back tomorrow for more analyses.
              </p>
              {resetTime && (
                <p className="text-amber-600 mt-2 text-xs">Resets in {resetTime}</p>
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
        {isDisabled ? "Come back tomorrow" : "Detect Patterns"}
      </button>
    </div>
  );
}

// Loading view
function LoadingView() {
  return (
    <div className="py-12 text-center">
      <IconLoader size={40} className="animate-spin text-purple-500 mx-auto mb-4" />
      <p className="text-neutral-600 font-medium">Scanning for patterns...</p>
      <p className="text-sm text-neutral-500 mt-1">This takes just a few seconds</p>
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

// Results view with actions
function ResultsView({
  result,
  note,
  onInsertContent,
  onReplaceContent,
}: {
  result: AIAnalysisResult;
  note: CombinedNote;
  onInsertContent?: (content: string) => void;
  onReplaceContent?: (content: string) => void;
}) {
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [showIndex, setShowIndex] = useState(false);

  const handleCopyTemplate = () => {
    if (result.template) {
      navigator.clipboard.writeText(result.template);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2000);
    }
  };

  const handleAddNewEntry = () => {
    if (result.template && onInsertContent) {
      // Add template at the end with blank lines
      onInsertContent("\n\n" + result.template);
    } else if (result.template) {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText("\n\n" + result.template);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2000);
    }
  };

  if (!result.patternFound) {
    return (
      <div className="py-8 text-center">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <IconList size={32} className="text-neutral-400" />
        </div>
        <p className="text-neutral-800 font-medium">No Pattern Detected</p>
        <p className="text-sm text-neutral-600 mt-2 max-w-xs mx-auto">
          This note doesn't appear to have repeating entries following a consistent structure.
        </p>
        <p className="text-xs text-neutral-500 mt-4">
          Patterns work best with notes that have multiple similar entries, like meeting notes, journal entries, or logs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Pattern Found Banner */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <IconCheck size={20} className="text-green-600" />
          <div>
            <p className="font-medium text-green-800">
              Pattern Found: {result.patternName || "Repeating Structure"}
            </p>
            <p className="text-sm text-green-700">
              {result.entryCount} entries detected
              {result.confidence && (
                <span className="ml-2 text-xs opacity-75">
                  ({result.confidence} confidence)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Fields Detected */}
      {result.fields.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-2 text-sm">Fields in each entry:</h3>
          <div className="flex flex-wrap gap-2">
            {result.fields.map((field, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <h3 className="font-medium text-neutral-800 text-sm">Actions:</h3>

        {/* Add New Entry */}
        <button
          onClick={handleAddNewEntry}
          className="w-full p-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus size={18} />
          {onInsertContent ? "Add New Entry" : "Copy Template for New Entry"}
        </button>

        {/* Index View Toggle */}
        <button
          onClick={() => setShowIndex(!showIndex)}
          className="w-full p-3 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
        >
          <IconList size={18} />
          {showIndex ? "Hide Index" : "Show Index of Entries"}
        </button>

        {/* Copy Template */}
        {result.template && (
          <button
            onClick={handleCopyTemplate}
            className="w-full p-3 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
          >
            {copiedTemplate ? (
              <>
                <IconCheck size={18} className="text-green-600" />
                Template Copied!
              </>
            ) : (
              <>
                <IconCopy size={18} />
                Copy Template
              </>
            )}
          </button>
        )}
      </div>

      {/* Index View */}
      {showIndex && result.entries.length > 0 && (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <div className="bg-neutral-50 px-3 py-2 border-b border-neutral-200">
            <h4 className="font-medium text-sm text-neutral-700">
              Index ({result.entries.length} entries)
            </h4>
          </div>
          <ul className="divide-y divide-neutral-100 max-h-48 overflow-y-auto">
            {result.entries.map((entry) => (
              <li key={entry.index} className="px-3 py-2 hover:bg-neutral-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 w-6">{entry.index}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-neutral-800 truncate">
                      {entry.title}
                    </p>
                    {entry.preview && (
                      <p className="text-xs text-neutral-500 truncate">
                        {entry.preview}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Template Preview */}
      {result.template && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-2 text-sm">Template Structure:</h3>
          <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-neutral-600 whitespace-pre-wrap overflow-x-auto">
            {result.template}
          </pre>
        </div>
      )}
    </div>
  );
}
