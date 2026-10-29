import { $markSchema, $remark } from "@milkdown/utils";

/**
 * Inline text highlight for the editor.
 *
 * Markdown has no native highlight, so highlights are stored as inline HTML:
 * `<mark data-c="yellow">text</mark>`. That's collision-free (unlike a `:hl[]`
 * directive, which would reinterpret ordinary prose like "Note:important" and
 * crash the parser) and portable to any HTML/markdown renderer.
 *
 * remark turns the two tags into *separate* unpaired inline-`html` nodes, so a
 * remark transform (below) re-pairs them into a `highlightMark` mdast node that
 * this schema maps to the ProseMirror mark; a matching stringify handler emits
 * the tags back. Stray/unpaired `<mark>` tags fall through to commonmark's
 * inline-html node and just render literally — no crash.
 *
 * The palette is fixed; keys are written verbatim into the stored markdown, so
 * keep them short, lowercase and stable.
 */
export const HIGHLIGHT_COLORS = [
  "yellow",
  "orange",
  "green",
  "blue",
  "pink",
  "purple",
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

const DEFAULT_COLOR: HighlightColor = "yellow";

export function normaliseHighlightColor(value: unknown): HighlightColor {
  return HIGHLIGHT_COLORS.includes(value as HighlightColor)
    ? (value as HighlightColor)
    : DEFAULT_COLOR;
}

const OPEN_MARK = /^<mark(\s[^>]*)?>$/i;
const CLOSE_MARK = /^<\/mark\s*>$/i;
const DATA_C = /data-c\s*=\s*["']([^"']*)["']/i;

type MdastNode = {
  type: string;
  value?: string;
  color?: string;
  children?: MdastNode[];
  [key: string]: unknown;
};

function openMarkColor(value: string | undefined): HighlightColor | null {
  if (!value || !OPEN_MARK.test(value)) return null;
  const m = value.match(DATA_C);
  return normaliseHighlightColor(m?.[1]);
}

// Replace each `<mark ...> … </mark>` run in a child list with a single
// `highlightMark` node. Handles nested marks via a depth counter; the inner
// run is left as-is and re-paired when the walker descends into it.
function pairHighlightMarks(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const color = node.type === "html" ? openMarkColor(node.value) : null;
    if (color) {
      let depth = 1;
      let close = -1;
      for (let j = i + 1; j < children.length; j++) {
        const c = children[j];
        if (c.type === "html" && OPEN_MARK.test(c.value ?? "")) depth++;
        else if (c.type === "html" && CLOSE_MARK.test(c.value ?? "")) {
          depth--;
          if (depth === 0) { close = j; break; }
        }
      }
      if (close !== -1) {
        out.push({ type: "highlightMark", color, children: children.slice(i + 1, close) });
        i = close;
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

// unified plugin (regular function so `this` is the processor): registers the
// stringify handler and returns the parse transform. Typed loosely because the
// mdast `Root` types don't unify with our structural MdastNode.
/* eslint-disable @typescript-eslint/no-explicit-any */
function remarkHighlightMarkPlugin(this: any) {
  const data = this.data();
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push({
    handlers: {
      highlightMark: (node: MdastNode, _parent: unknown, state: any, info: any) => {
        const color = normaliseHighlightColor(node.color);
        const content = state.containerPhrasing(node, { ...info, before: ">", after: "<" });
        return `<mark data-c="${color}">${content}</mark>`;
      },
    },
  });

  const walk = (node: MdastNode) => {
    if (!node.children) return;
    node.children = pairHighlightMarks(node.children);
    node.children.forEach(walk);
  };
  return (tree: any) => {
    walk(tree as MdastNode);
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const remarkHighlightMark = $remark(
  "remarkHighlightMark",
  () => remarkHighlightMarkPlugin,
);

export const highlightSchema = $markSchema("highlight", () => ({
  attrs: { color: { default: DEFAULT_COLOR } },
  parseDOM: [
    {
      tag: "mark",
      getAttrs: (dom) => ({
        color: normaliseHighlightColor((dom as HTMLElement).getAttribute("data-c")),
      }),
    },
  ],
  toDOM: (mark) => [
    "mark",
    { "data-c": mark.attrs.color, class: `jn-hl jn-hl-${mark.attrs.color}` },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === "highlightMark",
    runner: (state, node, markType) => {
      state.openMark(markType, { color: normaliseHighlightColor((node as MdastNode).color) });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "highlight",
    runner: (state, mark) => {
      state.withMark(mark, "highlightMark", undefined, { color: mark.attrs.color });
    },
  },
}));

// One import for the editor: the remark transform/serializer + the mark schema.
export const highlight = [...remarkHighlightMark, ...highlightSchema];
