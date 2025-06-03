// Auto-backup wrapper component
import React from "react";
import { CombinedNote } from "@/types/combined-notes";
import { useNotesBackup } from "@/utils/notes-backup";

export function AutoBackupProvider({
  children,
  notes,
}: {
  children: React.ReactNode;
  notes: CombinedNote[];
}) {
  const { backupAllNotes } = useNotesBackup();
  const prevNotesRef = React.useRef<CombinedNote[]>([]);

  React.useEffect(() => {
    const prevNotes = prevNotesRef.current;

    // Check if notes have changed
    if (
      notes.length !== prevNotes.length ||
      notes.some(
        (note, index) =>
          !prevNotes[index] ||
          note.content !== prevNotes[index].content ||
          note.title !== prevNotes[index].title,
      )
    ) {
      // Debounce the backup to avoid too frequent backups
      const timeoutId = setTimeout(() => {
        backupAllNotes(notes);
      }, 2000);

      prevNotesRef.current = [...notes];

      return () => clearTimeout(timeoutId);
    }
  }, [notes, backupAllNotes]);

  return <>{children}</>;
}
