import type { CombinedNote } from "@/types/combined-notes";

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50) || "untitled";
}

export function exportAsMarkdownZip(notes: CombinedNote[]) {
  // We'll create a simple concatenated file since we can't use JSZip without adding a dep.
  // Instead, export as a single JSON file with all notes, or individual downloads.
  // For a proper ZIP, we'd need the 'fflate' or 'jszip' package.
  // For now: export as a single JSON backup file.

  const exportData = notes.map((note) => ({
    title: note.title,
    content: note.content,
    contentFormat: note.contentFormat,
    isPinned: note.isPinned,
    isPrivate: note.isPrivate,
    notebookId: note.notebookId,
    goal: note.goal,
    goalType: note.goal_type,
    createdAt: new Date(note.createdAt).toISOString(),
    updatedAt: new Date(note.updatedAt).toISOString(),
  }));

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `justnoted-export-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllAsMarkdownFiles(notes: CombinedNote[]) {
  // Download each note as a separate .md file
  // Browsers don't support multi-file download natively, so we concatenate into one .md
  const content = notes
    .map((note) => {
      const header = `# ${note.title}\n\n`;
      const meta = `> Created: ${new Date(note.createdAt).toLocaleDateString()} | Updated: ${new Date(note.updatedAt).toLocaleDateString()}\n\n`;
      const separator = "\n\n---\n\n";
      return header + meta + note.content + separator;
    })
    .join("");

  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `justnoted-all-notes-${new Date().toISOString().split("T")[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
