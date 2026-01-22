// src/hooks/use-keyboard-shortcuts.ts
"use client";

import { useEffect, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";

interface KeyboardShortcutsOptions {
  onNewNote?: () => void;
  onSave?: () => void;
  onToggleDistractionFree?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts({
  onNewNote,
  onSave,
  onToggleDistractionFree,
  onSearch,
}: KeyboardShortcutsOptions) {
  const { toggleSidebar, setSidebarOpen } = useNotesStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl/Cmd + key shortcuts
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Escape - close sidebar or distraction-free mode
      if (e.key === "Escape") {
        const { sidebarOpen } = useNotesStore.getState();
        if (sidebarOpen) {
          setSidebarOpen(false);
          return;
        }
      }

      // Shortcuts that work even when typing
      if (isCtrlOrCmd) {
        // Ctrl/Cmd + S - Save
        if (e.key === "s" || e.key === "S") {
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
      }

      // Shortcuts that only work when NOT typing
      if (!isTyping && isCtrlOrCmd) {
        // Ctrl/Cmd + N - New note
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          onNewNote?.();
          return;
        }

        // Ctrl/Cmd + K or Ctrl/Cmd + / - Open search/sidebar
        if (e.key === "k" || e.key === "K" || e.key === "/") {
          e.preventDefault();
          toggleSidebar();
          onSearch?.();
          return;
        }

        // Ctrl/Cmd + B - Toggle sidebar
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          toggleSidebar();
          return;
        }
      }
    },
    [onNewNote, onSave, onToggleDistractionFree, onSearch, toggleSidebar, setSidebarOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Export a list of shortcuts for help display
export const KEYBOARD_SHORTCUTS = [
  { keys: ["Ctrl", "N"], description: "Create new note" },
  { keys: ["Ctrl", "S"], description: "Save current note" },
  { keys: ["Ctrl", "K"], description: "Open search" },
  { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
  { keys: ["Ctrl", "Shift", "F"], description: "Distraction-free mode" },
  { keys: ["Esc"], description: "Close sidebar/modal" },
];
