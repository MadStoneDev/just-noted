// src/utils/shared-active.ts
// Which row of the Shared sidebar list is the open note.
//
// A shared note open in the main area (sharedShortcode) wins: activeNoteId
// still points at the last own note while a shared one is open, so matching
// owned rows on it highlighted the wrong note (e.g. after tapping a "Note
// shared with you" notification, a note you'd shared yourself lit up instead).

export interface SharedActiveItem {
  source: "owned" | "granted" | "saved";
  shortcode: string;
  noteId?: string | null;
}

export function isSharedItemActive(
  item: SharedActiveItem,
  activeShortcode: string | null | undefined,
  activeNoteId: string | null | undefined,
): boolean {
  if (activeShortcode) return item.shortcode === activeShortcode;
  return item.source === "owned" && !!activeNoteId && item.noteId === activeNoteId;
}

export type SharedTab = "withme" | "byme" | "saved";

export function sharedTabFor(source: SharedActiveItem["source"]): SharedTab {
  return source === "owned" ? "byme" : source === "saved" ? "saved" : "withme";
}
