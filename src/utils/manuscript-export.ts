import { CombinedNote } from "@/types/combined-notes";

export interface ManuscriptExportOptions {
  notebookName: string;
  notes: CombinedNote[];
  format: "pdf" | "md";
  includeTableOfContents?: boolean;
}

function stripMarkdown(content: string): string {
  return (content || "")
    .replace(/<[^>]*>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```\w*\n?/, "").replace(/```/, ""),
    )
    .replace(/^\s*[-*+]\s+/gm, "  - ")
    .replace(/^\s*\d+\.\s+/gm, "  ")
    .replace(/^\s*>\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]")
    .replace(/^---+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportManuscript(
  options: ManuscriptExportOptions,
): Promise<void> {
  const sortedNotes = [...options.notes].sort((a, b) => a.order - b.order);

  if (options.format === "md") {
    exportManuscriptAsMarkdown(options.notebookName, sortedNotes);
  } else {
    await exportManuscriptAsPDF(
      options.notebookName,
      sortedNotes,
      options.includeTableOfContents,
    );
  }
}

function exportManuscriptAsMarkdown(
  notebookName: string,
  notes: CombinedNote[],
): void {
  const sections = notes.map((note) => {
    const title = note.title || "Untitled";
    return `## ${title}\n\n${note.content || ""}\n`;
  });

  const md = `# ${notebookName}\n\n${sections.join("\n---\n\n")}`;
  const filename = `${notebookName.replace(/[^a-zA-Z0-9-_ ]/g, "")}_manuscript.md`;
  triggerDownload(md, filename, "text/markdown;charset=utf-8");
}

async function exportManuscriptAsPDF(
  notebookName: string,
  notes: CombinedNote[],
  includeToC?: boolean,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 6;
  const maxY = pageHeight - margin;

  let currentY = margin;

  const addPage = () => {
    doc.addPage();
    currentY = margin;
  };

  const ensureSpace = (needed: number) => {
    if (currentY + needed > maxY) addPage();
  };

  const writeWrappedText = (
    text: string,
    fontSize: number,
    fontStyle: string = "normal",
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", fontStyle);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, currentY);
      currentY += lineHeight;
    }
  };

  // Title page
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(notebookName, contentWidth);
  const titleStartY = pageHeight * 0.35;
  currentY = titleStartY;
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, currentY, { align: "center" });
    currentY += 12;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${notes.length} section${notes.length !== 1 ? "s" : ""} · ${new Date().toLocaleDateString()}`,
    pageWidth / 2,
    currentY + 10,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);

  // Table of contents
  if (includeToC && notes.length > 1) {
    addPage();
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Table of Contents", margin, currentY);
    currentY += 12;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    notes.forEach((note, i) => {
      ensureSpace(lineHeight);
      const title = note.title || "Untitled";
      doc.text(`${i + 1}. ${title}`, margin + 5, currentY);
      currentY += lineHeight;
    });
  }

  // Content sections
  for (let i = 0; i < notes.length; i++) {
    addPage();
    const note = notes[i];
    const title = note.title || "Untitled";
    const plainText = stripMarkdown(note.content);

    // Section heading
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    const headingLines = doc.splitTextToSize(title, contentWidth);
    for (const line of headingLines) {
      ensureSpace(10);
      doc.text(line, margin, currentY);
      currentY += 10;
    }

    // Separator line
    currentY += 3;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, currentY, margin + contentWidth, currentY);
    currentY += 8;

    // Body text
    if (plainText) {
      const paragraphs = plainText.split(/\n\n+/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        writeWrappedText(trimmed, 11);
        currentY += 3;
      }
    }
  }

  const filename = `${notebookName.replace(/[^a-zA-Z0-9-_ ]/g, "")}_manuscript.pdf`;
  doc.save(filename);
}
