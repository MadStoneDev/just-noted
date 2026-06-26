// src/utils/wide-view.ts
// Persists the editor's wide-view preference across two layers:
//   - a global default (all notes wide), and
//   - per-note overrides (only stored when ON).
// Effective width for a note = default || override[noteId].

const DEFAULT_KEY = "justnoted.wideView.default";
const NOTES_KEY = "justnoted.wideView.notes";

export type WideLevel = "off" | "one" | "all";

function safeParse(json: string | null): Record<string, boolean> {
  if (!json) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function readWideDefault(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEFAULT_KEY) === "true";
}

export function readWideOverride(noteId: string): boolean {
  if (typeof window === "undefined") return false;
  return safeParse(localStorage.getItem(NOTES_KEY))[noteId] === true;
}

export function writeWideDefault(value: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEFAULT_KEY, value ? "true" : "false");
}

export function writeWideOverride(noteId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  const notes = safeParse(localStorage.getItem(NOTES_KEY));
  if (value) {
    notes[noteId] = true;
  } else {
    delete notes[noteId];
  }
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}
