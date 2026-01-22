"use client";

import { useState, useCallback } from "react";
import { CombinedNote } from "@/types/combined-notes";

export interface PatternResult {
  name: string;
  description: string;
  suggestion: string;
}

export interface NoteStructure {
  type: "list" | "outline" | "freeform" | "mixed" | "unknown";
  hasHeadings: boolean;
  hasChecklists: boolean;
  hasCodeBlocks: boolean;
  estimatedReadTime?: string;
}

export interface TemplatePotential {
  isGoodTemplate: boolean;
  templateName?: string;
  reason: string;
}

export interface AIAnalysisResult {
  structure: NoteStructure;
  patterns: PatternResult[];
  improvements: string[];
  templatePotential: TemplatePotential;
  summary: string;
}

export interface AIAnalysisState {
  isAnalyzing: boolean;
  result: AIAnalysisResult | null;
  error: string | null;
  remaining: number;
  resetAt: number | null;
}

const DAILY_LIMIT = 5;

/**
 * Hook for AI-powered analysis of a single note
 * Rate limited to 5 analyses per day
 */
export function useAIAnalysis(userId: string | null) {
  const [state, setState] = useState<AIAnalysisState>({
    isAnalyzing: false,
    result: null,
    error: null,
    remaining: DAILY_LIMIT,
    resetAt: null,
  });

  // Check current rate limit status
  const checkRateLimit = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch(`/api/ai/analyze-patterns?userId=${userId}`);
      const data = await response.json();

      setState((prev) => ({
        ...prev,
        remaining: data.remaining ?? DAILY_LIMIT,
        resetAt: data.resetAt ?? null,
      }));
    } catch (error) {
      console.error("Failed to check rate limit:", error);
    }
  }, [userId]);

  // Analyze a single note
  const analyzeNote = useCallback(
    async (note: CombinedNote) => {
      if (!userId) {
        setState((prev) => ({
          ...prev,
          error: "You must be signed in to use AI analysis",
        }));
        return null;
      }

      if (!note.content || note.content.trim().length === 0) {
        setState((prev) => ({
          ...prev,
          error: "This note is empty. Add some content first!",
        }));
        return null;
      }

      setState((prev) => ({
        ...prev,
        isAnalyzing: true,
        error: null,
      }));

      try {
        const response = await fetch("/api/ai/analyze-patterns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            note: {
              id: note.id,
              title: note.title,
              content: note.content,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            isAnalyzing: false,
            error: data.error || "Analysis failed",
            remaining: data.rateLimitExceeded ? 0 : prev.remaining,
            resetAt: data.resetAt ?? prev.resetAt,
          }));
          return null;
        }

        setState({
          isAnalyzing: false,
          result: data.analysis,
          error: null,
          remaining: data.remaining ?? 0,
          resetAt: data.resetAt ?? null,
        });

        return data.analysis as AIAnalysisResult;
      } catch (error) {
        console.error("AI analysis error:", error);
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          error: "Failed to connect to AI service. Please try again.",
        }));
        return null;
      }
    },
    [userId]
  );

  // Clear the current result
  const clearResult = useCallback(() => {
    setState((prev) => ({
      ...prev,
      result: null,
      error: null,
    }));
  }, []);

  // Format reset time for display
  const getResetTimeDisplay = useCallback(() => {
    if (!state.resetAt) return null;

    const now = Date.now();
    const diff = state.resetAt - now;

    if (diff <= 0) return "now";

    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, [state.resetAt]);

  return {
    ...state,
    analyzeNote,
    checkRateLimit,
    clearResult,
    getResetTimeDisplay,
    dailyLimit: DAILY_LIMIT,
  };
}
