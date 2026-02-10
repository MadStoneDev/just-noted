"use client";

import React, { useState, useRef, useEffect } from "react";
import { CombinedNote } from "@/types/combined-notes";
import {
  IconDownload,
  IconFileText,
  IconCode,
  IconMarkdown,
  IconFileTypeTxt,
  IconChevronRight,
  IconX,
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
      label: "TXT",
      icon: <IconFileTypeTxt size={18} />,
    },
    {
      format: "md" as ExportFormat,
      label: "MD",
      icon: <IconMarkdown size={18} />,
    },
    {
      format: "html" as ExportFormat,
      label: "HTML",
      icon: <IconCode size={18} />,
    },
    {
      format: "json" as ExportFormat,
      label: "JSON",
      icon: <IconFileText size={18} />,
    },
  ];

  return (
    <div ref={menuRef} className={`relative flex items-center ${className}`}>
      {/* Export trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center gap-1 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600 ${
          isOpen ? "bg-neutral-100" : ""
        }`}
        title="Export Note"
        aria-label="Export Note"
      >
        <IconDownload size={18} />
        <IconChevronRight
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
      </button>

      {/* Desktop: inline expanding options */}
      <div
        className={`hidden md:flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-w-[300px] opacity-100 ml-1" : "max-w-0 opacity-0"
        }`}
      >
        {menuItems.map((item) => (
          <button
            key={item.format}
            onClick={() => exportNote(item.format)}
            title={`Export as ${item.label}`}
            className="flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors whitespace-nowrap text-xs font-medium"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Mobile: slide-in overlay panel */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel from right */}
          <div className="absolute top-0 right-0 bottom-0 w-[min(280px,80vw)] bg-white shadow-xl flex flex-col animate-slide-in-right">
            {/* Panel header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-800">Export As</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors"
                aria-label="Close export menu"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Panel options */}
            <div className="flex flex-col p-2">
              {menuItems.map((item) => (
                <button
                  key={item.format}
                  onClick={() => exportNote(item.format)}
                  className="flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-lg text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-neutral-400">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
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
