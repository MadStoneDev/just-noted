import { CombinedNote } from "@/types/combined-notes";

const CACHE_KEY = "justnoted_notes_cache";
const CACHE_TIMESTAMP_KEY = "justnoted_notes_cache_ts";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedNotes(): CombinedNote[] | null {
  if (typeof window === "undefined") return null;

  try {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return null;

    const age = Date.now() - parseInt(timestamp, 10);
    if (age > CACHE_MAX_AGE) {
      clearNotesCache();
      return null;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    return JSON.parse(cached) as CombinedNote[];
  } catch {
    clearNotesCache();
    return null;
  }
}

export function setCachedNotes(notes: CombinedNote[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(notes));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // Storage might be full — silently fail
  }
}

export function clearNotesCache(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
  } catch {
    // Ignore
  }
}
