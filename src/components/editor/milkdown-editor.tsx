"use client";

import React, { useRef, useMemo, useCallback } from "react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/utils";
import { keymap } from "@milkdown/prose/keymap";
import FloatingToolbar from "./editor-toolbar";
import SlashMenu from "./slash-menu";
import LinkPopover from "./link-popover";

import type { ContentFormat } from "@/types/combined-notes";
import { htmlToMarkdown } from "@/utils/html-to-markdown";

const codeBlockEscape = $prose(() =>
  keymap({
    ArrowDown: (state, dispatch) => {
      const { $head } = state.selection;
      if ($head.node().type.name !== "code_block") return false;
      // Only when cursor is on the last line
      const textAfterCursor = $head.node().textContent.substring($head.parentOffset);
      if (textAfterCursor.includes("\n")) return false;
      const afterPos = $head.after();
      // If code block is at the end of the document, insert a paragraph after it
      if (afterPos >= state.doc.content.size && dispatch) {
        const tr = state.tr.insert(afterPos, state.schema.nodes.paragraph.create());
        dispatch(tr.setSelection(tr.selection.constructor.near(tr.doc.resolve(afterPos + 1)) as any));
        return true;
      }
      return false;
    },
    ArrowUp: (state, dispatch) => {
      const { $head } = state.selection;
      if ($head.node().type.name !== "code_block") return false;
      // Only when cursor is on the first line
      const textBeforeCursor = $head.node().textContent.substring(0, $head.parentOffset);
      if (textBeforeCursor.includes("\n")) return false;
      const beforePos = $head.before();
      // If code block is at the start of the document, insert a paragraph before it
      if (beforePos === 0 && dispatch) {
        const tr = state.tr.insert(0, state.schema.nodes.paragraph.create());
        dispatch(tr.setSelection(tr.selection.constructor.near(tr.doc.resolve(1)) as any));
        return true;
      }
      return false;
    },
  })
);

export interface CursorInfo {
  path: string[];
  marks: string[];
}

interface MilkdownEditorProps {
  content: string;
  contentFormat: ContentFormat;
  onChange?: (markdown: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

function cleanCorruptedMarkdown(text: string): string {
  if (!text) return text;
  let cleaned = text;

  // Strip backslash escapes
  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(/\\([*\[\]#>_`~|\-])/g, "$1");
  }

  // Only fix single-line corruption: if content has list markers but
  // virtually NO newlines, split them onto separate lines.
  const hasNewlines = cleaned.includes("\n");
  if (!hasNewlines) {
    const listMarkerCount = (cleaned.match(/[*\-]\s*\[[ x]\]/gi) || []).length;
    if (listMarkerCount > 2) {
      cleaned = cleaned.replace(/\s+([*\-])\s*\[( |x)\]\s*/gi, "\n- [$2] ");
      cleaned = cleaned.replace(/^\n+/, "");
    }
  }

  return cleaned;
}

function MilkdownEditorInner({
  content,
  contentFormat,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Start writing...",
  readOnly = false,
  className,
}: MilkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const containerRef = useRef<HTMLDivElement>(null);

  onChangeRef.current = onChange;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;

  const initialMarkdown = useMemo(() => {
    if (!content) return "";
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content.trim());
    const actuallyMarkdown = contentFormat === "markdown" || !looksLikeHtml;
    let md = actuallyMarkdown ? content : htmlToMarkdown(content);
    md = cleanCorruptedMarkdown(md);
    return md;
  }, []);

  const { get } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialMarkdown);
        ctx.set(remarkStringifyOptionsCtx, {
          bullet: "-",
          listItemIndent: "one",
        });

        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, markdown, prevMarkdown) => {
            if (markdown === prevMarkdown) return;
            onChangeRef.current?.(markdown);
          })
          .focus(() => {
            onFocusRef.current?.();
          })
          .blur(() => {
            onBlurRef.current?.();
          });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .use(codeBlockEscape);
  }, []);

  const handleTaskClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const li = target.closest("li[data-item-type='task']") as HTMLElement | null;
    if (!li) return;

    // Only toggle if click is in the checkbox area (left padding)
    const rect = li.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX > 28) return; // past the checkbox area

    e.preventDefault();
    e.stopPropagation();

    const editor = get();
    if (!editor) return;

    try {
      editor.action((ctx: any) => {
        const view = ctx.get(editorViewCtx) as any;
        const pos = view.posAtDOM(li, 0);
        const { state } = view;
        const resolved = state.doc.resolve(pos);

        // Walk up to find the list_item node
        for (let d = resolved.depth; d >= 0; d--) {
          const node = resolved.node(d);
          if (node.type.name === "list_item" && node.attrs.checked != null) {
            const from = resolved.before(d);
            const tr = state.tr.setNodeMarkup(from, undefined, {
              ...node.attrs,
              checked: !node.attrs.checked,
            });
            view.dispatch(tr);
            break;
          }
        }
      });
    } catch {}
  }, [get]);

  return (
    <div
      ref={containerRef}
      className={`milkdown relative ${className || ""}`}
      data-placeholder={placeholder}
      data-readonly={readOnly || undefined}
      onClick={handleTaskClick}
    >
      {!readOnly && (
        <>
          <FloatingToolbar getEditor={get} containerRef={containerRef} />
          <SlashMenu getEditor={get} containerRef={containerRef} />
          <LinkPopover getEditor={get} containerRef={containerRef} />
        </>
      )}
      <Milkdown />
    </div>
  );
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}

export default MilkdownEditor;
