"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { countWordsInContent } from "@/utils/word-count";
import {
  getWritingStreak,
  upsertWritingSession,
} from "@/app/actions/writingSessionActions";

// A gap this long with no writing ends the current session — the timer freezes
// and the next keystroke starts a fresh session. This is what stops the footer
// from reporting hundreds of hours for a tab that was simply left open.
const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const TICK_MS = 30 * 1000; // refresh the live duration every 30s
const FLUSH_INTERVAL = 5 * 60 * 1000; // persist word activity every 5 min

function getTotalWordCount(notes: { content: string }[]): number {
  return notes.reduce((sum, n) => sum + countWordsInContent(n.content), 0);
}

export function useWritingSession() {
  const isAuthenticated = useNotesStore((s) => s.isAuthenticated);
  const hasServerSynced = useNotesStore((s) => s.hasServerSynced);
  const notes = useNotesStore((s) => s.notes);

  const [sessionWordCount, setSessionWordCount] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [streak, setStreak] = useState(0);

  // Session state — anchored to writing activity, not to login/first paint.
  const sessionStartRef = useRef<number | null>(null);
  const baselineRef = useRef<number | null>(null); // total words at session start
  const lastActivityRef = useRef<number>(Date.now());
  const prevTotalRef = useRef<number | null>(null);
  const flushedWordsRef = useRef(0); // session words already sent to the DB

  // Derive the live duration: while actively writing the clock ticks; once idle
  // past the threshold it freezes at the last keystroke.
  const recompute = useCallback(() => {
    const now = Date.now();
    const start = sessionStartRef.current ?? now;
    const active = now - lastActivityRef.current <= IDLE_MS;
    const end = active ? now : lastActivityRef.current;
    setSessionDuration(Math.max(0, Math.round((end - start) / 1000)));
  }, []);

  // Prime the baseline once notes are reconciled (so the initial load of
  // existing words is never counted as "written this session"), then track
  // subsequent increases as real writing activity.
  useEffect(() => {
    if (!isAuthenticated || !hasServerSynced) return;

    const now = Date.now();
    const total = getTotalWordCount(notes);

    if (baselineRef.current === null || sessionStartRef.current === null) {
      baselineRef.current = total;
      sessionStartRef.current = now;
      lastActivityRef.current = now;
      prevTotalRef.current = total;
      flushedWordsRef.current = 0;
      setSessionWordCount(0);
      recompute();
      return;
    }

    const increased =
      prevTotalRef.current !== null && total > prevTotalRef.current;
    prevTotalRef.current = total;

    if (increased) {
      // If we were idle past the threshold, this keystroke begins a new session.
      if (now - lastActivityRef.current > IDLE_MS) {
        sessionStartRef.current = now;
        baselineRef.current = total;
        flushedWordsRef.current = 0;
      }
      lastActivityRef.current = now;
    }

    setSessionWordCount(Math.max(0, total - (baselineRef.current || 0)));
    recompute();
  }, [isAuthenticated, hasServerSynced, notes, recompute]);

  // Live tick so the duration advances (and freezes on idle) without a keystroke.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(recompute, TICK_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, recompute]);

  // Streak (per-day rows) — display only.
  useEffect(() => {
    if (!isAuthenticated) return;
    getWritingStreak().then((result) => {
      if (result.success) setStreak(result.streak || 0);
    });
  }, [isAuthenticated]);

  // Persist the incremental words written, so daily rows exist for the streak
  // and for a future lifetime/achievements stat.
  const flushToDb = useCallback(async () => {
    if (!isAuthenticated) return;
    const delta = sessionWordCount - flushedWordsRef.current;
    if (delta <= 0) return;
    flushedWordsRef.current = sessionWordCount;
    await upsertWritingSession({ wordsWritten: delta, durationSeconds: 0 });
  }, [isAuthenticated, sessionWordCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(flushToDb, FLUSH_INTERVAL);
    return () => clearInterval(id);
  }, [isAuthenticated, flushToDb]);

  // Best-effort flush of the session's remaining words on tab hide/close.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onHide = () => {
      const delta = sessionWordCount - flushedWordsRef.current;
      if (delta <= 0) return;
      flushedWordsRef.current = sessionWordCount;
      navigator.sendBeacon(
        "/api/writing-session",
        JSON.stringify({ wordsWritten: delta, durationSeconds: 0 }),
      );
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [isAuthenticated, sessionWordCount]);

  return {
    sessionWordCount,
    sessionDuration,
    streak,
  };
}
