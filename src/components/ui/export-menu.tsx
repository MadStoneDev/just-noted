"use client";

import React, { useState, useRef, useEffect } from "react";
import { CombinedNote } from "@/types/combined-notes";
import {
  IconDownload,
  IconFileText,
  IconCode,
  IconMarkdown,
  IconFileTypeTxt,
  IconChevronDown,
} from "@tabler/icons-react";

interface ExportMenuProps {
  note: CombinedNote;
  className?: string;
}

type ExportFormat = "txt" | "md" | "html" | "json";

export default function ExportMenu({ note, className = "" }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

    // Handle lists
    div.querySelectorAll("li").forEach((li) => {
      li.textContent = "• " + li.textContent + "\n";
    });

    // Handle paragraphs and headings
    div.querySelectorAll("p, h1, h2, h3, h4, h5, h6").forEach((el) => {
      el.textContent = el.textContent + "\n\n";
    });

    return div.textContent || div.innerText || "";
  };

  // Convert HTML to Markdown
  const htmlToMarkdown = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;

    let markdown = "";

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
        case "h1":
          return `# ${children}\n\n`;
        case "h2":
          return `## ${children}\n\n`;
        case "h3":
          return `### ${children}\n\n`;
        case "h4":
          return `#### ${children}\n\n`;
        case "h5":
          return `##### ${children}\n\n`;
        case "h6":
          return `###### ${children}\n\n`;
        case "p":
          return `${children}\n\n`;
        case "strong":
        case "b":
          return `**${children}**`;
        case "em":
        case "i":
          return `*${children}*`;
        case "u":
          return `<u>${children}</u>`;
        case "s":
        case "strike":
          return `~~${children}~~`;
        case "code":
          return `\`${children}\``;
        case "pre":
          return `\`\`\`\n${children}\n\`\`\`\n\n`;
        case "blockquote":
          return children
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n") + "\n\n";
        case "a":
          const href = el.getAttribute("href") || "";
          return `[${children}](${href})`;
        case "img":
          const src = el.getAttribute("src") || "";
          const alt = el.getAttribute("alt") || "";
          return `![${alt}](${src})`;
        case "ul":
          return children + "\n";
        case "ol":
          return children + "\n";
        case "li":
          const parent = el.parentElement;
          if (parent?.tagName.toLowerCase() === "ol") {
            const index = Array.from(parent.children).indexOf(el) + 1;
            return `${index}. ${children}\n`;
          }
          // Check for task list
          const checkbox = el.querySelector('input[type="checkbox"]');
          if (checkbox) {
            const checked = (checkbox as HTMLInputElement).checked ? "x" : " ";
            return `- [${checked}] ${children.replace(/^\s*/, "")}\n`;
          }
          return `- ${children}\n`;
        case "hr":
          return "---\n\n";
        case "br":
          return "\n";
        case "mark":
          return `==${children}==`;
        default:
          return children;
      }
    };

    Array.from(div.childNodes).forEach((node) => {
      markdown += processNode(node);
    });

    // Clean up extra newlines
    return markdown.replace(/\n{3,}/g, "\n\n").trim();
  };

  // Export function
  const exportNote = (format: ExportFormat) => {
    let content: string;
    let mimeType: string;
    let extension: string;

    const sanitizedTitle = note.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    switch (format) {
      case "txt":
        content = `${note.title}\n${"=".repeat(note.title.length)}\n\n${htmlToPlainText(note.content)}`;
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "md":
        content = `# ${note.title}\n\n${htmlToMarkdown(note.content)}`;
        mimeType = "text/markdown";
        extension = "md";
        break;
      case "html":
        content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${note.title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { color: #03BFB5; }
    a { color: #03BFB5; }
    code { background: #f1f5f9; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
    pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
    blockquote { border-left: 4px solid #03BFB5; padding-left: 1rem; margin-left: 0; color: #64748b; }
    img { max-width: 100%; height: auto; border-radius: 0.5rem; }
  </style>
</head>
<body>
  <h1>${note.title}</h1>
  ${note.content}
</body>
</html>`;
        mimeType = "text/html";
        extension = "html";
        break;
      case "json":
        content = JSON.stringify(
          {
            title: note.title,
            content: note.content,
            plainText: htmlToPlainText(note.content),
            markdown: htmlToMarkdown(note.content),
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            isPinned: note.isPinned,
            tags: [], // For future use
          },
          null,
          2
        );
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
    a.download = `${sanitizedTitle}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsOpen(false);
  };

  const menuItems = [
    {
      format: "txt" as ExportFormat,
      label: "Plain Text",
      icon: <IconFileTypeTxt size={16} />,
      description: ".txt - Simple text format",
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
      description: ".json - Data format",
    },
  ];

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg hover:bg-neutral-100 transition-colors flex items-center gap-1 text-neutral-600 ${
          isOpen ? "bg-neutral-100" : ""
        }`}
        title="Export Note"
      >
        <IconDownload size={18} />
        <IconChevronDown
          size={14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[200px] z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 border-b border-neutral-100">
            Export As
          </div>
          {menuItems.map((item) => (
            <button
              key={item.format}
              onClick={() => exportNote(item.format)}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 flex items-center gap-3 transition-colors"
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

// Bulk export all notes
export function exportAllNotes(notes: CombinedNote[], format: "json" | "zip") {
  if (format === "json") {
    const content = JSON.stringify(
      notes.map((note) => ({
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        isPinned: note.isPinned,
        source: note.source,
      })),
      null,
      2
    );

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `justnoted_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  // ZIP format would require a library like JSZip
}
