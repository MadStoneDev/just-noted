import { marked } from "marked";
import { htmlToMarkdown } from "@/utils/html-to-markdown";

export type ExportFormat = "md" | "mdx" | "txt" | "html" | "json" | "xml";

export const EXPORT_FORMATS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: "md", label: "Markdown (.md)", ext: "md" },
  { format: "mdx", label: "MDX (.mdx)", ext: "mdx" },
  { format: "txt", label: "Plain text (.txt)", ext: "txt" },
  { format: "html", label: "HTML (.html)", ext: "html" },
  { format: "json", label: "JSON (.json)", ext: "json" },
  { format: "xml", label: "XML (.xml)", ext: "xml" },
];

interface ExportableNote {
  title: string;
  content: string;
  contentFormat?: string;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
}

function slugify(title: string): string {
  const s = (title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "untitled";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toMarkdown(note: ExportableNote): string {
  const c = note.content || "";
  const looksHtml = /<[a-z][\s\S]*>/i.test(c.trim());
  return note.contentFormat === "html" && looksHtml ? htmlToMarkdown(c) : c;
}

function toHtml(note: ExportableNote): string {
  const c = note.content || "";
  const looksHtml = /<[a-z][\s\S]*>/i.test(c.trim());
  if (note.contentFormat === "html" && looksHtml) return c;
  return marked.parse(c, { async: false, gfm: true, breaks: false }) as string;
}

function toPlainText(note: ExportableNote): string {
  const html = toHtml(note);
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = html;
    return (el.textContent || "").trim();
  }
  return html.replace(/<[^>]+>/g, "");
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export a single note to the chosen format (client-side download). */
export function exportNote(note: ExportableNote, format: ExportFormat) {
  const title = note.title || "Untitled";
  const base = slugify(title);

  switch (format) {
    case "md":
    case "mdx": {
      const body = `# ${title}\n\n${toMarkdown(note)}\n`;
      download(`${base}.${format}`, body, "text/markdown");
      break;
    }
    case "txt": {
      download(`${base}.txt`, `${title}\n\n${toPlainText(note)}\n`, "text/plain");
      break;
    }
    case "html": {
      const doc = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeXml(title)}</title></head>
<body>
<h1>${escapeXml(title)}</h1>
${toHtml(note)}
</body>
</html>`;
      download(`${base}.html`, doc, "text/html");
      break;
    }
    case "json": {
      const payload = {
        title,
        content: note.content || "",
        contentFormat: note.contentFormat || "markdown",
        createdAt: note.createdAt ?? null,
        updatedAt: note.updatedAt ?? null,
        exportedAt: new Date().toISOString(),
      };
      download(`${base}.json`, JSON.stringify(payload, null, 2), "application/json");
      break;
    }
    case "xml": {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<note>
  <title>${escapeXml(title)}</title>
  <contentFormat>${escapeXml(note.contentFormat || "markdown")}</contentFormat>
  <content>${escapeXml(note.content || "")}</content>
</note>`;
      download(`${base}.xml`, xml, "application/xml");
      break;
    }
  }
}
