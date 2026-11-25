// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { Node as ProseNode } from "@milkdown/prose/model";
import {
  cleanCorruptedMarkdown,
  emptyLineMarker,
  markdownStringifyOptions,
} from "./markdown-io";

// Round-trip tests for the editor's markdown boundary: the real Milkdown parser
// and serialiser, configured as milkdown-editor.tsx configures them (stringify
// options + the emptyLineMarker plugin), plus the load step (cleanCorruptedMarkdown).

let editor: Editor;
const parse = (md: string): ProseNode => editor.ctx.get(parserCtx)(md);
const serialise = (doc: ProseNode): string => editor.ctx.get(serializerCtx)(doc);

/** What the app does: load (clean → parse) then save (serialise). */
const loadAndSave = (md: string): string => serialise(parse(cleanCorruptedMarkdown(md)));

async function makeEditor(markdown = ""): Promise<Editor> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(remarkStringifyOptionsCtx, markdownStringifyOptions);
    })
    .use(commonmark)
    .use(gfm)
    .use(emptyLineMarker)
    .create();
}

beforeAll(async () => {
  editor = await makeEditor();
});
afterAll(async () => {
  await editor?.destroy();
});

// Each case is markdown exactly as the editor writes it.
const CASES: Record<string, string> = {
  "bullet-only": "- one\n- two\n- three\n",
  "task-only": "- [ ] a\n- [x] b\n- [ ] c\n",
  "mixed bullet + task": "- one\n- two\n- [ ] task item\n",
  "nested bullets": "- parent\n  - child\n    - grandchild\n- sibling\n",
  "nested tasks": "- [ ] parent\n  - [x] child\n- [ ] sibling\n",
  numbered: "1. one\n2. two\n3. three\n",
  "nested numbered": "1. one\n   1. sub\n2. two\n",
  "list after a heading": "# Title\n\n- one\n- two\n",
  "loose list stays loose": "- one\n\n- two\n",
  "literal \\- in a list item": "- one\n- \\- two\n",
  "literal \\*not em\\*": "a \\*not em\\* b\n",
  "literal \\> and \\[x]": "\\> not a quote\n\n\\[x] not a task\n",
  "code block containing backslashes":
    "```\nC:\\Users\\me\\notes\n\\- not an escape\ngrep -E '\\[x\\]' file\necho \"a\\\\b\"\n```\n",
  "inline code containing backslashes": "run `grep '\\-v' \\\\ C:\\dir` here\n",
  // A "\" not before punctuation is literal as written ("a \ b"); a literal "\"
  // before punctuation must itself be escaped ("\\\*" is the text "\*").
  "literal backslashes in prose": "C:\\Users\\me and a \\ b\n",
  "literal backslash before punctuation": "a \\\\\\*b and \\\\- c\n",
  // Code is content: an earlier save step rewrote "<br>" and collapsed blank
  // lines across the whole note, code included.
  "<br> inside a code block": "```html\nline one<br>line two\n```\n",
  "code block of only <br />": "```html\n<br />\n```\n",
  "<br /> in inline code": "use `<br />` tags\n",
  "blank lines in a code block": "```\na\n\n\n\nb\n```\n",
  "code with <br> and blank lines next to empty lines":
    "a\n\n&nbsp;\n\n```html\nx<br>y\n\n\nz\n```\n\n&nbsp;\n\nb\n",
  "&nbsp; line inside a code block stays code": "```\n&nbsp;\n```\n",
  // Typed text "&nbsp;" is text, escaped — never an empty line.
  "literal &nbsp; text": "a \\&nbsp; b\n\n\\&nbsp;\n",
  "empty line inside a quote": "> a\n>\n> &nbsp;\n>\n> b\n",
};

describe("markdown round-trip", () => {
  for (const [name, md] of Object.entries(CASES)) {
    describe(name, () => {
      it("serialise(parse(md)) === md", () => {
        expect(serialise(parse(md))).toBe(md);
      });

      it("parse(serialise(doc)) equals doc", () => {
        const doc = parse(md);
        expect(parse(serialise(doc)).eq(doc)).toBe(true);
      });

      it("is unchanged by three load/save cycles", () => {
        let current = md;
        for (let i = 0; i < 3; i++) {
          current = loadAndSave(current);
          expect(current).toBe(md);
        }
      });
    });
  }
});

describe("typed content round-trips", () => {
  // Drive the editor as a user would: text input runs the input rules
  // ("- " → bullet list, "[ ] " → task), Enter/Tab run the list keymaps.
  async function typeLines(lines: string[]): Promise<string> {
    const ed = await makeEditor();
    try {
      const view = ed.ctx.get(editorViewCtx);
      const key = (k: string, shiftKey = false) =>
        view.someProp("handleKeyDown", (f) =>
          f(view, new KeyboardEvent("keydown", { key: k, shiftKey })),
        );
      const type = (text: string) => {
        for (const ch of text) {
          const { from, to } = view.state.selection;
          const handled = view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr));
          if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
        }
      };
      lines.forEach((line, i) => {
        if (i > 0) key("Enter");
        let text = line;
        while (text.startsWith("<TAB>")) {
          key("Tab");
          text = text.slice(5);
        }
        type(text);
      });
      return ed.ctx.get(serializerCtx)(view.state.doc);
    } finally {
      await ed.destroy();
    }
  }

  const TYPED: Array<[string, string[], string]> = [
    // The reported repro: "- two" typed on a line that is already a bullet stays
    // literal text, saved escaped — and must never reload as a nested list.
    ["bug repro: - one / - two / [ ] task item", ["- one", "- two", "[ ] task item"], "- one\n- \\- two\n- [ ] task item\n"],
    ["mixed bullet + task", ["- one", "two", "[ ] task item"], "- one\n- two\n- [ ] task item\n"],
    ["nested via Tab", ["- parent", "<TAB>child", "[ ] task"], "- parent\n  - child\n  - [ ] task\n"],
    ["numbered after a heading", ["# Title", "1. one", "two", "<TAB>sub"], "# Title\n\n1. one\n2. two\n   1. sub\n"],
    ["one empty line typed mid-note", ["a", "", "b"], "a\n\n&nbsp;\n\nb\n"],
    ["three empty lines typed mid-note", ["a", "", "", "", "b"], "a\n\n&nbsp;\n\n&nbsp;\n\n&nbsp;\n\nb\n"],
    ["empty line typed after a heading", ["# Title", "", "b"], "# Title\n\n&nbsp;\n\nb\n"],
  ];

  for (const [name, lines, expected] of TYPED) {
    it(`${name}: saves as expected and survives three reloads`, async () => {
      let md = await typeLines(lines);
      expect(md).toBe(expected);
      for (let i = 0; i < 3; i++) {
        md = loadAndSave(md);
        expect(md).toBe(expected);
      }
    });
  }
});

// Intentional empty lines mid-note. In the editor an empty line is an empty
// paragraph; it must survive save and every reload. Each is stored as a
// `&nbsp;` line (indented to its container inside a list item).
describe("intentional empty lines mid-note", () => {
  const schema = () => parse("a").type.schema;
  const p = (text?: string) =>
    schema().nodes.paragraph.create(null, text ? schema().text(text) : null);
  const empties = (n: number) => Array.from({ length: n }, () => p());
  const h1 = (text: string) => schema().nodes.heading.create({ level: 1 }, schema().text(text));
  const li = (...content: ProseNode[]) => schema().nodes.list_item.create(null, content);
  const ul = (...items: ProseNode[]) => schema().nodes.bullet_list.create(null, items);
  const doc = (...content: ProseNode[]) => schema().nodes.doc.create(null, content);

  /** What the editor stores when it saves `d`. */
  const save = (d: ProseNode) => serialise(d);
  // Structure only: a built list carries the schema's boolean `spread`
  // defaults, a parsed one the strings "true"/"false" (see listSpreadJoin), so
  // Node.eq would differ on attrs alone. toString() compares nodes and text.
  const sameStructure = (a: ProseNode, b: ProseNode) => a.toString() === b.toString();

  const EMPTY_LINE_CASES: Array<[string, () => ProseNode, string]> = [
    ["one empty line between paragraphs", () => doc(p("a"), ...empties(1), p("b")), "a\n\n&nbsp;\n\nb\n"],
    ["two empty lines between paragraphs", () => doc(p("a"), ...empties(2), p("b")), "a\n\n&nbsp;\n\n&nbsp;\n\nb\n"],
    [
      "three empty lines between paragraphs",
      () => doc(p("a"), ...empties(3), p("b")),
      "a\n\n&nbsp;\n\n&nbsp;\n\n&nbsp;\n\nb\n",
    ],
    ["empty line after a heading", () => doc(h1("Title"), ...empties(1), p("b")), "# Title\n\n&nbsp;\n\nb\n"],
    [
      "empty line inside a list item",
      () => doc(ul(li(p("one"), p()), li(p("two")))),
      "- one\n\n  &nbsp;\n- two\n",
    ],
    [
      "empty line between two lists",
      () => doc(ul(li(p("one"))), p(), ul(li(p("two")))),
      "- one\n\n&nbsp;\n\n- two\n",
    ],
  ];

  for (const [name, build, stored] of EMPTY_LINE_CASES) {
    describe(name, () => {
      it("saves each empty line as a marker line", () => {
        expect(save(build())).toBe(stored);
      });

      it("reloads to the same document", () => {
        const d = build();
        expect(sameStructure(parse(cleanCorruptedMarkdown(save(d))), d)).toBe(true);
      });

      it("is unchanged by three load/save cycles", () => {
        let current = save(build());
        for (let i = 0; i < 3; i++) {
          current = loadAndSave(current);
          expect(current).toBe(stored);
        }
        expect(sameStructure(parse(current), build())).toBe(true);
      });
    });
  }
});

describe("legacy and pasted empty lines", () => {
  it("a note saved with the old `<br />` lines keeps them, rewritten as `&nbsp;`", () => {
    const legacy = "a\n\n<br />\n\n<br />\n\nb\n";
    expect(parse(legacy).toString()).toBe("doc(paragraph(\"a\"), paragraph, paragraph, paragraph(\"b\"))");
    expect(loadAndSave(legacy)).toBe("a\n\n&nbsp;\n\n&nbsp;\n\nb\n");
  });

  it("pasted markdown with `&nbsp;` lines (or a bare U+00A0 line) gives empty paragraphs", () => {
    // Paste goes through the same parser (milkdown-editor's markdownPaste).
    expect(parse("a\n\n&nbsp;\n\nb\n").toString()).toBe("doc(paragraph(\"a\"), paragraph, paragraph(\"b\"))");
    expect(parse("a\n\n\u00a0\n\nb\n").toString()).toBe("doc(paragraph(\"a\"), paragraph, paragraph(\"b\"))");
  });

  it("a paragraph with text and a non-breaking space is not an empty line", () => {
    expect(parse("a&nbsp;b\n").toString()).toBe("doc(paragraph(\"a\u00a0b\"))");
  });
});

describe("cleanCorruptedMarkdown", () => {
  it("never removes backslashes", () => {
    const md = "- \\- two\n\na \\*b\\* \\# c \\\\ d\n";
    expect(cleanCorruptedMarkdown(md)).toBe(md);
    expect(cleanCorruptedMarkdown("a \\*b\\*")).toBe("a \\*b\\*");
  });

  it("still repairs a task list collapsed onto one line", () => {
    expect(cleanCorruptedMarkdown("- [ ] a - [x] b - [ ] c")).toBe("- [ ] a\n- [x] b\n- [ ] c");
  });

  it("leaves task-like text inside inline code alone", () => {
    const md = "see `- [ ] a - [ ] b - [ ] c` and - [ ] x";
    expect(cleanCorruptedMarkdown(md)).toBe(md);
    expect(cleanCorruptedMarkdown("`x - [ ] y` - [ ] a - [ ] b - [ ] c")).toBe(
      "`x - [ ] y`\n- [ ] a\n- [ ] b\n- [ ] c",
    );
  });

  it("leaves multi-line content (and so every code block) untouched", () => {
    const md = "```\n- [ ] a - [ ] b - [ ] c \\-\n```\n";
    expect(cleanCorruptedMarkdown(md)).toBe(md);
  });

  it("tasks serialise as '- [ ] ' / '- [x] ' (with the space GFM requires)", () => {
    expect(serialise(parse("- [ ] a\n- [x] b\n"))).toBe("- [ ] a\n- [x] b\n");
    expect(cleanCorruptedMarkdown("- [ ] a - [x] b - [ ] c")).not.toMatch(/\[\]/);
  });
});
