import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let turndownInstance: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndownInstance) return turndownInstance;

  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  td.use(gfm);

  // TipTap task list items
  td.addRule("taskListItem", {
    filter: (node) => {
      return (
        node.nodeName === "LI" &&
        node.parentElement?.getAttribute("data-type") === "taskList"
      );
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const checkbox = el.querySelector('input[type="checkbox"]');
      const checked = checkbox?.hasAttribute("checked") || el.getAttribute("data-checked") === "true";
      const textDiv = el.querySelector("div") || el.querySelector("p");
      const text = textDiv?.textContent?.trim() || _content.trim();
      return `- [${checked ? "x" : " "}] ${text}\n`;
    },
  });

  // TipTap task list container
  td.addRule("taskList", {
    filter: (node) => {
      return (
        node.nodeName === "UL" &&
        node.getAttribute("data-type") === "taskList"
      );
    },
    replacement: (content) => {
      return `\n${content}\n`;
    },
  });

  // TipTap highlight marks
  td.addRule("highlight", {
    filter: "mark",
    replacement: (content) => `==${content}==`,
  });

  // Handle text alignment (strip it — markdown doesn't support it natively)
  td.addRule("textAlign", {
    filter: (node) => {
      const el = node as HTMLElement;
      return !!el.style?.textAlign && ["P", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName);
    },
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const tag = el.nodeName;
      if (tag.startsWith("H")) {
        const level = parseInt(tag[1]);
        return `\n${"#".repeat(level)} ${content.trim()}\n\n`;
      }
      return `\n${content.trim()}\n\n`;
    },
  });

  // Clean up empty paragraphs that TipTap generates
  td.addRule("emptyParagraph", {
    filter: (node) => {
      return (
        node.nodeName === "P" &&
        (node.textContent?.trim() === "" || node.innerHTML === "<br>")
      );
    },
    replacement: () => "\n\n",
  });

  // Underline (not standard markdown, use HTML tag)
  td.addRule("underline", {
    filter: "u",
    replacement: (content) => `<u>${content}</u>`,
  });

  // Subscript
  td.addRule("subscript", {
    filter: "sub",
    replacement: (content) => `<sub>${content}</sub>`,
  });

  // Superscript
  td.addRule("superscript", {
    filter: "sup",
    replacement: (content) => `<sup>${content}</sup>`,
  });

  turndownInstance = td;
  return td;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === "") return "";

  const td = getTurndown();
  let markdown = td.turndown(html);

  // Clean up excessive newlines
  markdown = markdown.replace(/\n{3,}/g, "\n\n");

  // Clean up trailing whitespace on lines
  markdown = markdown
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Trim leading/trailing whitespace
  markdown = markdown.trim();

  return markdown;
}

export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  return /<[a-z][\s\S]*>/i.test(content.trim());
}
