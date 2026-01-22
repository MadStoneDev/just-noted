"use client";

import { useState, useCallback } from "react";
import { CombinedNote } from "@/types/combined-notes";

export interface PatternResult {
  type: "structure" | "topic" | "format";
  name: string;
  description: string;
  frequency: "daily" | "weekly" | "occasional";
  suggestedTemplate?: string;
}

export interface SimilarNote {
  noteTitle: string;
  similarity: string;
}

export interface AIAnalysisResult {
  patterns: PatternResult[];
  similarNotes: SimilarNote[];
  suggestions: string[];
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
 * Hook for AI-powered pattern analysis of notes
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

  // Analyze notes for patterns
  const analyzePatterns = useCallback(
    async (notes: CombinedNote[], currentNoteId?: string) => {
      if (!userId) {
        setState((prev) => ({
          ...prev,
          error: "You must be signed in to use AI analysis",
        }));
        return null;
      }

      if (notes.length === 0) {
        setState((prev) => ({
          ...prev,
          error: "No notes available for analysis",
        }));
        return null;
      }

      setState((prev) => ({
        ...prev,
        isAnalyzing: true,
        error: null,
      }));

      try {
        // Prepare notes for API (strip to essential fields)
        const notesForAnalysis = notes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content,
          createdAt: note.createdAt,
        }));

        const response = await fetch("/api/ai/analyze-patterns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            notes: notesForAnalysis,
            currentNoteId,
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
    analyzePatterns,
    checkRateLimit,
    clearResult,
    getResetTimeDisplay,
    dailyLimit: DAILY_LIMIT,
  };
}
