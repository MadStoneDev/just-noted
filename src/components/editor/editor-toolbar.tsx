"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@milkdown/core";
import { callCommand, insert } from "@milkdown/utils";
import { editorViewCtx } from "@milkdown/core";
import { lift } from "@milkdown/prose/commands";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import {
  toggleStrikethroughCommand,
} from "@milkdown/preset-gfm";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconCheckbox,
  IconQuote,
  IconMinus,
  IconCodeDots,
} from "@tabler/icons-react";

interface FloatingToolbarProps {
  getEditor: () => Editor | undefined;
  containerRef: React.RefObject<HTMLElement | null>;
}

export default function FloatingToolbar({ getEditor, containerRef }: FloatingToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    (cmd: Parameters<typeof callCommand>[0], payload?: any) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action(callCommand(cmd, payload));
      } catch {}
    },
    [getEditor],
  );

  const toggleHeading = useCallback(
    (level: number) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const { $from } = state.selection;
          const currentNode = $from.parent;

          if (currentNode.type.name === "heading" && currentNode.attrs.level === level) {
            const paragraphType = state.schema.nodes.paragraph;
            if (paragraphType) {
              const tr = state.tr.setBlockType($from.before($from.depth), $from.after($from.depth), paragraphType);
              view.dispatch(tr);
            }
          } else {
            callCommand(wrapInHeadingCommand.key, level)(ctx);
          }
        });
      } catch {}
    },
    [getEditor],
  );

  const handleList = useCallback(
    (type: "bullet" | "ordered" | "task") => {
      const editor = getEditor();
      if (!editor) return;

      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const { $from } = state.selection;
          const schema = state.schema;

          // Find if we're inside a list item
          let listItemDepth = -1;
          let listDepth = -1;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "list_item") listItemDepth = d;
            if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
              listDepth = d;
              break;
            }
          }

          if (type === "task") {
            if (listItemDepth > 0) {
              // Already in a list item — toggle checked attribute
              const listItem = $from.node(listItemDepth);
              const pos = $from.before(listItemDepth);
              if (listItem.attrs.checked != null) {
                // Already a task — remove checked (convert back to regular)
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...listItem.attrs,
                  checked: null,
                });
                view.dispatch(tr);
              } else {
                // Regular item — make it a task
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...listItem.attrs,
                  checked: false,
                });
                view.dispatch(tr);
              }
            } else {
              // Not in a list — create bullet list then set checked
              callCommand(wrapInBulletListCommand.key)(ctx);
              // After wrapping, set checked on the new list item
              setTimeout(() => {
                const newState = view.state;
                const new$from = newState.selection.$from;
                for (let d = new$from.depth; d > 0; d--) {
                  if (new$from.node(d).type.name === "list_item") {
                    const tr = newState.tr.setNodeMarkup(new$from.before(d), undefined, {
                      ...new$from.node(d).attrs,
                      checked: false,
                    });
                    view.dispatch(tr);
                    break;
                  }
                }
              }, 0);
            }
          } else if (listDepth > 0) {
            // Already in a list — convert type
            const listNode = $from.node(listDepth);
            const targetType = type === "bullet" ? schema.nodes.bullet_list : schema.nodes.ordered_list;
            const currentType = listNode.type.name;
            const wantedType = type === "bullet" ? "bullet_list" : "ordered_list";

            if (currentType === wantedType) {
              // Same type — unwrap (lift)
              
              lift(state, view.dispatch);
            } else {
              // Different type — convert
              const pos = $from.before(listDepth);
              const tr = state.tr.setNodeMarkup(pos, targetType, listNode.attrs);
              view.dispatch(tr);
            }
          } else {
            // Not in a list — wrap
            if (type === "bullet") {
              callCommand(wrapInBulletListCommand.key)(ctx);
            } else {
              callCommand(wrapInOrderedListCommand.key)(ctx);
            }
          }
        });
      } catch {}
    },
    [getEditor],
  );

  const toggleBlock = useCallback(
    (blockName: string, wrapCommand: Parameters<typeof callCommand>[0]) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const { $from } = state.selection;

          // Check if cursor is inside this block type
          let insideBlock = false;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === blockName) {
              insideBlock = true;
              // Lift content out of the block
              
              lift(state, view.dispatch);
              break;
            }
          }

          if (!insideBlock) {
            callCommand(wrapCommand)(ctx);
          }
        });
      } catch {}
    },
    [getEditor],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        hideTimeoutRef.current = setTimeout(() => setVisible(false), 150);
        return;
      }

      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) {
        setVisible(false);
        return;
      }

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setVisible(true);
    };

    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [containerRef]);

  if (!visible) return null;

  const btn = "p-1.5 text-[var(--color-text-inverse)] opacity-70 hover:opacity-100 hover:bg-[var(--color-bg-primary)]/10 rounded-[var(--radius-sm)] transition-all cursor-pointer";
  const sep = "w-px self-stretch bg-[var(--color-bg-primary)]/15 mx-0.5";

  const toolbar = (
    <div
      ref={toolbarRef}
      className="fixed z-[9999] flex flex-wrap items-center gap-px px-1.5 py-1 bg-[var(--color-text-primary)] rounded-[var(--radius-lg)] shadow-lg animate-fade-in"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y - 8}px`,
        transform: "translate(-50%, -100%)",
        maxWidth: 240,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className={btn} onClick={() => run(toggleStrongCommand.key)} title="Bold (Ctrl+B)">
        <IconBold size={14} />
      </button>
      <button className={btn} onClick={() => run(toggleEmphasisCommand.key)} title="Italic (Ctrl+I)">
        <IconItalic size={14} />
      </button>
      <button className={btn} onClick={() => run(toggleStrikethroughCommand.key)} title="Strikethrough">
        <IconStrikethrough size={14} />
      </button>
      <button className={btn} onClick={() => run(toggleInlineCodeCommand.key)} title="Inline code">
        <IconCode size={14} />
      </button>

      <div className={sep} />

      <button className={btn} onClick={() => toggleHeading(1)} title="Heading 1">
        <IconH1 size={14} />
      </button>
      <button className={btn} onClick={() => toggleHeading(2)} title="Heading 2">
        <IconH2 size={14} />
      </button>
      <button className={btn} onClick={() => toggleHeading(3)} title="Heading 3">
        <IconH3 size={14} />
      </button>

      <div className={sep} />

      <button className={btn} onClick={() => handleList("bullet")} title="Bullet list">
        <IconList size={14} />
      </button>
      <button className={btn} onClick={() => handleList("ordered")} title="Numbered list">
        <IconListNumbers size={14} />
      </button>
      <button className={btn} onClick={() => handleList("task")} title="Task list">
        <IconCheckbox size={14} />
      </button>

      <div className={sep} />

      <button className={btn} onClick={() => toggleBlock("blockquote", wrapInBlockquoteCommand.key)} title="Blockquote (toggle)">
        <IconQuote size={14} />
      </button>
      <button className={btn} onClick={() => toggleBlock("code_block", createCodeBlockCommand.key)} title="Code block (toggle)">
        <IconCodeDots size={14} />
      </button>
      <button className={btn} onClick={() => run(insertHrCommand.key)} title="Horizontal rule">
        <IconMinus size={14} />
      </button>
    </div>
  );

  // Portal to body so it's never clipped by overflow-hidden
  if (typeof document !== "undefined") {
    return createPortal(toolbar, document.body);
  }
  return toolbar;
}
