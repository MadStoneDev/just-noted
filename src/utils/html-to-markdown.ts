import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { EMPTY_LINE_MARKER } from "@/utils/empty-line-marker";

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
    // `<p>&nbsp;</p>` (and `<p></p>`) is "blank" to turndown, so it never
    // reaches a rule: an empty paragraph in an old HTML note is an intentional
    // empty line, kept as the editor's empty-line marker.
    blankReplacement: (_content, node) =>
      node.nodeName === "P"
        ? `\n\n${EMPTY_LINE_MARKER}\n\n`
        : (node as unknown as { isBlock?: boolean }).isBlock
          ? "\n\n"
          : "",
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

  // TipTap writes an empty line as `<p><br></p>` (not "blank" to turndown,
  // because of the <br>): keep it as the editor's empty-line marker. Only a
  // paragraph of nothing but <br>s and whitespace — one holding an image or
  // other element is content.
  td.addRule("emptyParagraph", {
    filter: (node) =>
      node.nodeName === "P" &&
      (node.textContent ?? "").trim() === "" &&
      Array.from(node.childNodes).every(
        (c) => c.nodeName === "BR" || (c.nodeType === 3 && (c.textContent ?? "").trim() === ""),
      ),
    replacement: () => `\n\n${EMPTY_LINE_MARKER}\n\n`,
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

  // Trim leading/trailing whitespace, and empty lines at the very start or end
  // (TipTap often leaves an empty paragraph there; only mid-note ones are
  // intentional).
  markdown = markdown.trim();
  const edgeMarker = new RegExp(`^(?:${EMPTY_LINE_MARKER}\\s*)+|(?:\\s*${EMPTY_LINE_MARKER})+$`, "g");
  markdown = markdown.replace(edgeMarker, "").trim();

  return markdown;
}

export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  return /<[a-z][\s\S]*>/i.test(content.trim());
}
