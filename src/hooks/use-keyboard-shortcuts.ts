// src/hooks/use-keyboard-shortcuts.ts
"use client";

import { useEffect, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";

interface KeyboardShortcutsOptions {
  onNewNote?: () => void;
  onSave?: () => void;
  onToggleDistractionFree?: () => void;
  onToggleSplitView?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts({
  onNewNote,
  onSave,
  onToggleDistractionFree,
  onToggleSplitView,
  onSearch,
}: KeyboardShortcutsOptions) {
  const { toggleSidebar, setSidebarOpen, toggleToc } = useNotesStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Escape - close sidebar or distraction-free mode
      if (e.key === "Escape") {
        const { sidebarOpen } = useNotesStore.getState();
        if (sidebarOpen) {
          setSidebarOpen(false);
          return;
        }
      }

      // Ctrl/Cmd + Alt + key — note switching
      if (isCtrlOrCmd && e.altKey) {
        const { getFilteredNotes, activeNoteId, setActiveNoteId } = useNotesStore.getState();
        const visibleNotes = getFilteredNotes();

        // Ctrl/Cmd + Alt + 1-9,0 — jump to note by position (0 = 10th)
        const digitMatch = e.key.match(/^(\d)$/);
        if (digitMatch) {
          e.preventDefault();
          const digit = parseInt(digitMatch[1]);
          const index = digit === 0 ? 9 : digit - 1;
          if (index < visibleNotes.length) {
            setActiveNoteId(visibleNotes[index].id);
          }
          return;
        }

        // Ctrl/Cmd + Alt + Up/Down — prev/next note
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const currentIndex = visibleNotes.findIndex((n) => n.id === activeNoteId);
          if (currentIndex === -1) return;
          const nextIndex = e.key === "ArrowUp"
            ? Math.max(0, currentIndex - 1)
            : Math.min(visibleNotes.length - 1, currentIndex + 1);
          setActiveNoteId(visibleNotes[nextIndex].id);
          return;
        }
      }

      // Ctrl/Cmd + key shortcuts (work even when typing)
      if (isCtrlOrCmd) {
        // Ctrl/Cmd + S - Save
        if (!e.shiftKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          onSave?.();
          return;
        }

        // Ctrl/Cmd + Shift + F - Toggle distraction-free
        if (e.shiftKey && (e.key === "f" || e.key === "F")) {
          e.preventDefault();
          onToggleDistractionFree?.();
          return;
        }

        // Ctrl/Cmd + Shift + T - Toggle Table of Contents
        if (e.shiftKey && (e.key === "t" || e.key === "T")) {
          e.preventDefault();
          toggleToc();
          return;
        }

        // Ctrl/Cmd + Shift + S - Toggle Split View
        if (e.shiftKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          onToggleSplitView?.();
          return;
        }

        // Ctrl/Cmd + J - New note
        if (e.key === "j" || e.key === "J") {
          e.preventDefault();
          onNewNote?.();
          return;
        }

        // Ctrl/Cmd + K - Global search
        if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          onSearch?.();
          return;
        }

        // Ctrl/Cmd + \ - Toggle sidebar
        if (e.key === "\\") {
          e.preventDefault();
          toggleSidebar();
          return;
        }
      }
    },
    [onNewNote, onSave, onToggleDistractionFree, onToggleSplitView, onSearch, toggleSidebar, setSidebarOpen, toggleToc]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Export a list of shortcuts for help display
export const KEYBOARD_SHORTCUTS = [
  { keys: ["Ctrl", "J"], description: "Create new note" },
  { keys: ["Ctrl", "S"], description: "Save current note" },
  { keys: ["Ctrl", "K"], description: "Open search" },
  { keys: ["Ctrl", "\\"], description: "Toggle sidebar" },
  { keys: ["Ctrl", "Shift", "F"], description: "Distraction-free mode" },
  { keys: ["Ctrl", "Shift", "T"], description: "Table of Contents" },
  { keys: ["Ctrl", "Shift", "S"], description: "Split view" },
  { keys: ["Ctrl", "Alt", "1-9, 0"], description: "Jump to note 1-10" },
  { keys: ["Ctrl", "Alt", "↑/↓"], description: "Previous/next note" },
  { keys: ["Esc"], description: "Close sidebar/modal" },
];
