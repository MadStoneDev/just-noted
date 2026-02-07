"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { CombinedNote } from "@/types/combined-notes";
import {
  IconDownload,
  IconFileText,
  IconMarkdown,
  IconFileTypeTxt,
  IconCode,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react";

interface NotebookExportButtonProps {
  notebookId: string;
  notebookName: string;
}

type ExportFormat = "txt" | "md" | "html" | "json";

export default function NotebookExportButton({
  notebookId,
  notebookName,
}: NotebookExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const notes = useNotesStore((state) => state.notes);

  // Get notes in this notebook
  const notebookNotes = notes.filter(
    (note) => note.source === "supabase" && note.notebookId === notebookId
  );

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Convert HTML to plain text
  const htmlToPlainText = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("li").forEach((li) => {
      li.textContent = "• " + li.textContent + "\n";
    });
    div.querySelectorAll("p, h1, h2, h3, h4, h5, h6").forEach((el) => {
      el.textContent = el.textContent + "\n\n";
    });
    return div.textContent || div.innerText || "";
  };

  // Convert HTML to Markdown
  const htmlToMarkdown = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;

    const processNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || "";
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const children = Array.from(el.childNodes).map(processNode).join("");

      switch (tag) {
        case "h1": return `# ${children}\n\n`;
        case "h2": return `## ${children}\n\n`;
        case "h3": return `### ${children}\n\n`;
        case "p": return `${children}\n\n`;
        case "strong":
        case "b": return `**${children}**`;
        case "em":
        case "i": return `*${children}*`;
        case "code": return `\`${children}\``;
        case "ul":
        case "ol": return children + "\n";
        case "li": return `- ${children}\n`;
        case "br": return "\n";
        default: return children;
      }
    };

    let markdown = "";
    Array.from(div.childNodes).forEach((node) => {
      markdown += processNode(node);
    });
    return markdown.replace(/\n{3,}/g, "\n\n").trim();
  };

  // Generate export content for a single note
  const formatNote = (note: CombinedNote, format: ExportFormat): string => {
    switch (format) {
      case "txt":
        return `${note.title}\n${"=".repeat(note.title.length)}\n\n${htmlToPlainText(note.content)}`;
      case "md":
        return `# ${note.title}\n\n${htmlToMarkdown(note.content)}`;
      default:
        return "";
    }
  };

  // Export notebook
  const exportNotebook = async (format: ExportFormat) => {
    if (notebookNotes.length === 0) {
      console.warn("No notes to export in this notebook");
      return;
    }

    setIsExporting(true);

    try {
      const sanitizedName = notebookName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const timestamp = new Date().toISOString().split("T")[0];

      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case "txt":
          content = notebookNotes
            .map((note) => formatNote(note, "txt"))
            .join("\n\n---\n\n");
          mimeType = "text/plain";
          extension = "txt";
          break;

        case "md":
          content = `# ${notebookName}\n\nExported on ${timestamp}\n\n---\n\n` +
            notebookNotes
              .map((note) => formatNote(note, "md"))
              .join("\n\n---\n\n");
          mimeType = "text/markdown";
          extension = "md";
          break;

        case "html":
          const notesHtml = notebookNotes
            .map((note) => `<article><h2>${note.title}</h2>${note.content}</article>`)
            .join("<hr/>");
          content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${notebookName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { color: #03BFB5; border-bottom: 2px solid #03BFB5; padding-bottom: 0.5rem; }
    h2 { color: #333; margin-top: 2rem; }
    article { margin-bottom: 3rem; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 2rem 0; }
    a { color: #03BFB5; }
    code { background: #f1f5f9; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <h1>${notebookName}</h1>
  <p><em>Exported on ${timestamp} - ${notebookNotes.length} notes</em></p>
  ${notesHtml}
</body>
</html>`;
          mimeType = "text/html";
          extension = "html";
          break;

        case "json":
          content = JSON.stringify({
            notebook: notebookName,
            exportedAt: new Date().toISOString(),
            noteCount: notebookNotes.length,
            notes: notebookNotes.map((note) => ({
              id: note.id,
              title: note.title,
              content: note.content,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
              isPinned: note.isPinned,
            })),
          }, null, 2);
          mimeType = "application/json";
          extension = "json";
          break;

        default:
          return;
      }

      // Create and trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizedName}_${timestamp}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
      console.error("Failed to export notebook");
    } finally {
      setIsExporting(false);
    }
  };

  const menuItems = [
    {
      format: "txt" as ExportFormat,
      label: "Plain Text",
      icon: <IconFileTypeTxt size={16} />,
      description: ".txt - All notes combined",
    },
    {
      format: "md" as ExportFormat,
      label: "Markdown",
      icon: <IconMarkdown size={16} />,
      description: ".md - Formatted text",
    },
    {
      format: "html" as ExportFormat,
      label: "HTML",
      icon: <IconCode size={16} />,
      description: ".html - Web page format",
    },
    {
      format: "json" as ExportFormat,
      label: "JSON",
      icon: <IconFileText size={16} />,
      description: ".json - Data backup",
    },
  ];

  if (notebookNotes.length === 0) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
        title={`Export ${notebookNotes.length} notes`}
      >
        {isExporting ? (
          <IconLoader2 size={18} className="animate-spin" />
        ) : (
          <IconDownload size={18} />
        )}
        <IconChevronDown
          size={14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[220px] z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 border-b border-neutral-100">
            Export {notebookNotes.length} Notes
          </div>
          {menuItems.map((item) => (
            <button
              key={item.format}
              onClick={() => exportNotebook(item.format)}
              disabled={isExporting}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 transition-colors disabled:opacity-50"
            >
              <span className="text-neutral-500">{item.icon}</span>
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-neutral-400">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
