"use client";

import React, { useState, useEffect } from "react";
import {
  IconSparkles,
  IconX,
  IconBulb,
  IconTemplate,
  IconAlertCircle,
  IconLoader,
  IconInfoCircle,
  IconList,
  IconFileText,
  IconCode,
  IconCheckbox,
  IconClock,
} from "@tabler/icons-react";
import { useAIAnalysis, AIAnalysisResult } from "@/hooks/use-ai-analysis";
import { CombinedNote } from "@/types/combined-notes";

interface AIAnalysisButtonProps {
  userId: string | null;
  note: CombinedNote;
  isPrivate?: boolean;
}

/**
 * AI Analysis button for a single note - shows in note toolbar
 */
export default function AIAnalysisButton({
  userId,
  note,
  isPrivate = false,
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
        title={userId ? "Analyze this note with AI" : "Sign in to use AI features"}
      >
        <IconSparkles size={20} strokeWidth={2} />
        <span className="w-fit max-w-0 sm:group-hover/ai:max-w-52 opacity-0 md:group-hover/ai:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap">
          AI Analyze
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
                    AI Analysis
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
                  noteTitle={note.title}
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
  noteTitle,
}: {
  remaining: number;
  dailyLimit: number;
  resetTime: string | null;
  onAnalyze: () => void;
  isDisabled: boolean;
  noteTitle: string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <IconInfoCircle size={24} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-purple-900">What will AI analyze?</h3>
            <p className="text-sm text-purple-700 mt-1">
              AI will examine <strong>"{noteTitle}"</strong> and tell you:
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-3 ml-2">
        <li className="flex items-start gap-3">
          <IconFileText size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Structure Analysis</span>
            <p className="text-sm text-neutral-600">
              How your note is organized (lists, headings, checklists)
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconBulb size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Improvement Suggestions</span>
            <p className="text-sm text-neutral-600">
              Tips to make your note clearer or better organized
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <IconTemplate size={20} className="text-purple-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Template Potential</span>
            <p className="text-sm text-neutral-600">
              Whether this note could become a reusable template
            </p>
          </div>
        </li>
      </ul>

      {remaining === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-3">
            <IconSparkles size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">You've used all your analyses for today!</p>
              <p className="text-amber-700 mt-1">
                Come back tomorrow for more. We're working on expanded AI features coming soon!
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
        {isDisabled ? "Come back tomorrow" : "Analyze This Note"}
      </button>
    </div>
  );
}

// Loading view
function LoadingView() {
  return (
    <div className="py-12 text-center">
      <IconLoader size={40} className="animate-spin text-purple-500 mx-auto mb-4" />
      <p className="text-neutral-600 font-medium">Analyzing your note...</p>
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

// Results view
function ResultsView({ result }: { result: AIAnalysisResult }) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <p className="text-sm text-purple-800">{result.summary}</p>
      </div>

      {/* Structure */}
      <div>
        <h3 className="font-medium text-neutral-800 mb-2 flex items-center gap-2">
          <IconList size={18} className="text-purple-500" />
          Note Structure
        </h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-neutral-100 rounded text-sm capitalize">
            {result.structure.type}
          </span>
          {result.structure.hasHeadings && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm flex items-center gap-1">
              <IconFileText size={14} /> Headings
            </span>
          )}
          {result.structure.hasChecklists && (
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm flex items-center gap-1">
              <IconCheckbox size={14} /> Checklists
            </span>
          )}
          {result.structure.hasCodeBlocks && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm flex items-center gap-1">
              <IconCode size={14} /> Code
            </span>
          )}
          {result.structure.estimatedReadTime && (
            <span className="px-2 py-1 bg-neutral-100 rounded text-sm flex items-center gap-1">
              <IconClock size={14} /> {result.structure.estimatedReadTime}
            </span>
          )}
        </div>
      </div>

      {/* Patterns */}
      {result.patterns.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-2 flex items-center gap-2">
            <IconSparkles size={18} className="text-purple-500" />
            Patterns Found
          </h3>
          <div className="space-y-2">
            {result.patterns.map((pattern, index) => (
              <div
                key={index}
                className="bg-neutral-50 border border-neutral-200 rounded-lg p-3"
              >
                <p className="font-medium text-sm">{pattern.name}</p>
                <p className="text-xs text-neutral-600 mt-1">{pattern.description}</p>
                {pattern.suggestion && (
                  <p className="text-xs text-purple-600 mt-2">
                    💡 {pattern.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {result.improvements.length > 0 && (
        <div>
          <h3 className="font-medium text-neutral-800 mb-2 flex items-center gap-2">
            <IconBulb size={18} className="text-purple-500" />
            Suggestions
          </h3>
          <ul className="space-y-2">
            {result.improvements.map((improvement, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-neutral-700"
              >
                <span className="text-purple-500 mt-0.5">•</span>
                {improvement}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Template Potential */}
      <div>
        <h3 className="font-medium text-neutral-800 mb-2 flex items-center gap-2">
          <IconTemplate size={18} className="text-purple-500" />
          Template Potential
        </h3>
        <div
          className={`p-3 rounded-lg border ${
            result.templatePotential.isGoodTemplate
              ? "bg-green-50 border-green-200"
              : "bg-neutral-50 border-neutral-200"
          }`}
        >
          {result.templatePotential.isGoodTemplate ? (
            <div>
              <p className="font-medium text-green-800 text-sm">
                ✓ Good template candidate!
              </p>
              {result.templatePotential.templateName && (
                <p className="text-xs text-green-700 mt-1">
                  Suggested name: "{result.templatePotential.templateName}"
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              {result.templatePotential.reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
