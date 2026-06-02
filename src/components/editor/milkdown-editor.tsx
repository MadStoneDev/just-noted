"use client";

import React, { useRef, useMemo } from "react";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import FloatingToolbar from "./editor-toolbar";

import type { ContentFormat } from "@/types/combined-notes";
import { htmlToMarkdown } from "@/utils/html-to-markdown";

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
      .use(clipboard);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`milkdown relative ${className || ""}`}
      data-placeholder={placeholder}
      data-readonly={readOnly || undefined}
    >
      {!readOnly && (
        <FloatingToolbar getEditor={get} containerRef={containerRef} />
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
