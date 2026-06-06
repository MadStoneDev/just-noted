"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { countWordsInContent } from "@/utils/word-count";
import {
  getTodaySession,
  getWritingStreak,
  upsertWritingSession,
} from "@/app/actions/writingSessionActions";

const FLUSH_INTERVAL = 5 * 60 * 1000;
const SESSION_BASELINE_KEY = "justnoted_session_baseline";
const SESSION_START_KEY = "justnoted_session_start";

function getTotalWordCount(notes: { content: string }[]): number {
  return notes.reduce((sum, n) => sum + countWordsInContent(n.content), 0);
}

export function useWritingSession() {
  const isAuthenticated = useNotesStore((s) => s.isAuthenticated);
  const notes = useNotesStore((s) => s.notes);

  const [sessionWordCount, setSessionWordCount] = useState(0);
  const [todayWordCount, setTodayWordCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionStart] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    const stored = sessionStorage.getItem(SESSION_START_KEY);
    if (stored) return parseInt(stored, 10);
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  });

  const baselineRef = useRef<number | null>(null);
  const lastFlushedDeltaRef = useRef(0);
  const todayBaseRef = useRef(0);

  // Initialize baseline and load today's stats
  useEffect(() => {
    if (!isAuthenticated) return;

    const currentTotal = getTotalWordCount(notes);

    if (baselineRef.current === null) {
      const storedBaseline = sessionStorage.getItem(SESSION_BASELINE_KEY);
      if (storedBaseline) {
        baselineRef.current = parseInt(storedBaseline, 10);
      } else {
        baselineRef.current = currentTotal;
        sessionStorage.setItem(SESSION_BASELINE_KEY, String(currentTotal));
      }
    }

    const delta = Math.max(0, currentTotal - (baselineRef.current || 0));
    setSessionWordCount(delta);

    getTodaySession().then((result) => {
      if (result.success && result.session) {
        todayBaseRef.current = result.session.wordsWritten;
        setTodayWordCount(result.session.wordsWritten + delta);
      } else {
        setTodayWordCount(delta);
      }
    });

    getWritingStreak().then((result) => {
      if (result.success) {
        setStreak(result.streak || 0);
      }
    });
  }, [isAuthenticated, notes.length]);

  // Track word count changes
  useEffect(() => {
    if (!isAuthenticated || baselineRef.current === null) return;
    const currentTotal = getTotalWordCount(notes);
    const delta = Math.max(0, currentTotal - (baselineRef.current || 0));
    setSessionWordCount(delta);
    setTodayWordCount(todayBaseRef.current + delta);
  }, [isAuthenticated, notes]);

  // Flush to DB periodically
  const flushToDb = useCallback(async () => {
    if (!isAuthenticated) return;
    const delta = sessionWordCount - lastFlushedDeltaRef.current;
    if (delta <= 0) return;

    const elapsed = Math.round((Date.now() - sessionStart) / 1000);
    const durationDelta = elapsed - (lastFlushedDeltaRef.current > 0 ? elapsed : 0);

    lastFlushedDeltaRef.current = sessionWordCount;

    await upsertWritingSession({
      wordsWritten: delta,
      durationSeconds: Math.max(0, durationDelta),
    });
  }, [isAuthenticated, sessionWordCount, sessionStart]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(flushToDb, FLUSH_INTERVAL);
    return () => clearInterval(interval);
  }, [isAuthenticated, flushToDb]);

  // Flush on page unload via sendBeacon
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleUnload = () => {
      const delta = sessionWordCount - lastFlushedDeltaRef.current;
      if (delta <= 0) return;

      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      navigator.sendBeacon(
        "/api/writing-session",
        JSON.stringify({
          wordsWritten: delta,
          durationSeconds: elapsed,
        }),
      );
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [isAuthenticated, sessionWordCount, sessionStart]);

  const sessionDuration = Math.round((Date.now() - sessionStart) / 1000);

  return {
    sessionWordCount,
    todayWordCount,
    streak,
    sessionDuration,
  };
}
