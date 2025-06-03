"use client";

import { useEffect } from "react";
import { useNotesBackup } from "@/utils/notes-backup";

// This is an enhanced version of your existing useCombinedNotes hook
// that integrates automatic backup functionality

interface CombinedNote {
  id: string;
  title: string;
  content: string;
  source: "redis" | "supabase";
  isPinned?: boolean;
  isPrivate?: boolean;
  goal?: number;
  goal_type?: string;
  isCollapsed?: boolean;
  created_at?: string;
  updated_at?: string;
}

export function useCombinedNotesWithBackup(notes: CombinedNote[]) {
  const { backupNote, backupAllNotes } = useNotesBackup();

  // Auto-backup when notes change
  useEffect(() => {
    if (notes.length > 0) {
      // Debounce the backup to avoid too frequent calls
      const timeoutId = setTimeout(() => {
        backupAllNotes(notes);
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [notes, backupAllNotes]);

  // Function to manually backup a single note
  const backupSingleNote = async (
    note: CombinedNote,
    changeType: "create" | "update" | "delete" = "update",
  ) => {
    await backupNote(note, changeType);
  };

  return {
    backupSingleNote,
    backupAllNotes: () => backupAllNotes(notes),
  };
}
