"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@milkdown/core";
import { callCommand } from "@milkdown/utils";
import { editorViewCtx } from "@milkdown/core";
import { lift } from "@milkdown/prose/commands";
import { sinkListItem, liftListItem } from "@milkdown/prose/schema-list";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  insertImageCommand,
  turnIntoTextCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import {
  toggleStrikethroughCommand,
  insertTableCommand,
} from "@milkdown/preset-gfm";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconPilcrow,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconCheckbox,
  IconIndentIncrease,
  IconIndentDecrease,
  IconQuote,
  IconMinus,
  IconCodeDots,
  IconTable,
  IconPhoto,
  IconLink,
} from "@tabler/icons-react";

interface FloatingToolbarProps {
  getEditor: () => Editor | undefined;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface ActiveState {
  strong: boolean;
  emphasis: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  heading: number | null;
  paragraph: boolean;
  bulletList: boolean;
  orderedList: boolean;
  task: boolean;
  blockquote: boolean;
  codeBlock: boolean;
}

const EMPTY_ACTIVE: ActiveState = {
  strong: false, emphasis: false, strike: false, code: false, link: false,
  heading: null, paragraph: false, bulletList: false, orderedList: false,
  task: false, blockquote: false, codeBlock: false,
};

function isMarkActive(state: EditorState, markName: string): boolean {
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
}

function computeActive(state: EditorState): ActiveState {
  const { $from } = state.selection;
  const active: ActiveState = { ...EMPTY_ACTIVE };

  active.strong = isMarkActive(state, "strong");
  active.emphasis = isMarkActive(state, "emphasis");
  active.strike = isMarkActive(state, "strike_through");
  active.code = isMarkActive(state, "inlineCode");
  active.link = isMarkActive(state, "link");

  const parent = $from.parent;
  if (parent.type.name === "heading") active.heading = parent.attrs.level as number;
  if (parent.type.name === "paragraph") active.paragraph = true;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const name = node.type.name;
    if (name === "blockquote") active.blockquote = true;
    else if (name === "code_block") active.codeBlock = true;
    else if (name === "bullet_list") active.bulletList = true;
    else if (name === "ordered_list") active.orderedList = true;
    else if (name === "list_item" && node.attrs.checked != null) active.task = true;
  }

  return active;
}

export default function FloatingToolbar({ getEditor, containerRef }: FloatingToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const withView = useCallback(
    (fn: (view: EditorView, state: EditorState) => void) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          fn(view, view.state);
        });
      } catch {}
    },
    [getEditor],
  );

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

  // Reset the current block back to paragraph / body text.
  const setParagraph = useCallback(() => run(turnIntoTextCommand.key), [run]);

  // Indent / outdent — only meaningful inside a list item.
  const indent = useCallback(() => {
    withView((view, state) => {
      const itemType = state.schema.nodes.list_item;
      if (itemType) sinkListItem(itemType)(state, view.dispatch);
    });
  }, [withView]);

  const outdent = useCallback(() => {
    withView((view, state) => {
      const itemType = state.schema.nodes.list_item;
      if (itemType) liftListItem(itemType)(state, view.dispatch);
    });
  }, [withView]);

  const insertImage = useCallback(() => {
    const src = prompt("Image URL:");
    if (src) run(insertImageCommand.key, { src });
  }, [run]);

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

  const toggleLink = useCallback(() => {
    withView((view, state) => {
      const { from, to } = state.selection;
      const linkType = state.schema.marks.link;
      if (!linkType) return;

      let hasLink = false;
      state.doc.nodesBetween(from, to, (node) => {
        if (node.marks.some((m: any) => m.type === linkType)) hasLink = true;
      });

      if (hasLink) {
        view.dispatch(state.tr.removeMark(from, to, linkType));
      } else {
        const url = prompt("Enter URL:");
        if (url) run(toggleLinkCommand.key, { href: url });
      }
    });
  }, [withView, run]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const TOOLBAR_H = 44;
    const MARGIN = 8;

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

      let y = rect.top;
      if (y < TOOLBAR_H + MARGIN) {
        y = Math.min(rect.bottom + MARGIN, window.innerHeight - MARGIN);
      }

      setPos({
        x: Math.max(120, Math.min(rect.left + rect.width / 2, window.innerWidth - 120)),
        y,
      });

      // Reflect the selection's formatting on the buttons.
      const editor = getEditor();
      if (editor) {
        try {
          editor.action((ctx) => {
            setActive(computeActive(ctx.get(editorViewCtx).state));
          });
        } catch {}
      }

      setVisible(true);
    };

    const scrollParent = container.closest("[class*='overflow']") || window;
    document.addEventListener("selectionchange", update);
    scrollParent.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      scrollParent.removeEventListener("scroll", update);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [containerRef, getEditor]);

  if (!visible) return null;

  const btn = "p-1.5 text-[var(--color-text-inverse)] opacity-70 hover:opacity-100 hover:bg-[var(--color-bg-primary)]/10 rounded-[var(--radius-sm)] transition-all cursor-pointer";
  const btnActive = "p-1.5 text-[var(--color-text-inverse)] opacity-100 bg-[var(--color-bg-primary)]/25 rounded-[var(--radius-sm)] transition-all cursor-pointer";
  const sep = "w-px self-stretch bg-[var(--color-bg-primary)]/15 mx-0.5";
  const cls = (on: boolean) => (on ? btnActive : btn);

  const toolbar = (
    <div
      ref={toolbarRef}
      className="fixed z-[9999] flex flex-wrap items-center gap-px px-1.5 py-1 bg-[var(--color-text-primary)] rounded-[var(--radius-lg)] shadow-lg animate-fade-in"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y - 8}px`,
        transform: "translate(-50%, -100%)",
        maxWidth: "min(calc(100vw - 16px), 380px)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className={cls(active.strong)} onClick={() => run(toggleStrongCommand.key)} title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={active.strong}>
        <IconBold size={14} />
      </button>
      <button className={cls(active.emphasis)} onClick={() => run(toggleEmphasisCommand.key)} title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={active.emphasis}>
        <IconItalic size={14} />
      </button>
      <button className={cls(active.strike)} onClick={() => run(toggleStrikethroughCommand.key)} title="Strikethrough" aria-label="Strikethrough" aria-pressed={active.strike}>
        <IconStrikethrough size={14} />
      </button>
      <button className={cls(active.code)} onClick={() => run(toggleInlineCodeCommand.key)} title="Inline code" aria-label="Inline code" aria-pressed={active.code}>
        <IconCode size={14} />
      </button>
      <button className={cls(active.link)} onClick={toggleLink} title="Toggle link" aria-label="Toggle link" aria-pressed={active.link}>
        <IconLink size={14} />
      </button>

      <div className={sep} />

      <button className={cls(active.paragraph)} onClick={setParagraph} title="Paragraph / body text" aria-label="Paragraph" aria-pressed={active.paragraph}>
        <IconPilcrow size={14} />
      </button>
      <button className={cls(active.heading === 1)} onClick={() => toggleHeading(1)} title="Heading 1" aria-label="Heading 1" aria-pressed={active.heading === 1}>
        <IconH1 size={14} />
      </button>
      <button className={cls(active.heading === 2)} onClick={() => toggleHeading(2)} title="Heading 2" aria-label="Heading 2" aria-pressed={active.heading === 2}>
        <IconH2 size={14} />
      </button>
      <button className={cls(active.heading === 3)} onClick={() => toggleHeading(3)} title="Heading 3" aria-label="Heading 3" aria-pressed={active.heading === 3}>
        <IconH3 size={14} />
      </button>

      <div className={sep} />

      <button className={cls(active.bulletList && !active.task)} onClick={() => handleList("bullet")} title="Bullet list" aria-label="Bullet list" aria-pressed={active.bulletList && !active.task}>
        <IconList size={14} />
      </button>
      <button className={cls(active.orderedList)} onClick={() => handleList("ordered")} title="Numbered list" aria-label="Numbered list" aria-pressed={active.orderedList}>
        <IconListNumbers size={14} />
      </button>
      <button className={cls(active.task)} onClick={() => handleList("task")} title="Task list" aria-label="Task list" aria-pressed={active.task}>
        <IconCheckbox size={14} />
      </button>
      <button className={btn} onClick={outdent} title="Outdent" aria-label="Outdent">
        <IconIndentDecrease size={14} />
      </button>
      <button className={btn} onClick={indent} title="Indent" aria-label="Indent">
        <IconIndentIncrease size={14} />
      </button>

      <div className={sep} />

      <button className={cls(active.blockquote)} onClick={() => toggleBlock("blockquote", wrapInBlockquoteCommand.key)} title="Blockquote (toggle)" aria-label="Blockquote" aria-pressed={active.blockquote}>
        <IconQuote size={14} />
      </button>
      <button className={cls(active.codeBlock)} onClick={() => toggleBlock("code_block", createCodeBlockCommand.key)} title="Code block (toggle)" aria-label="Code block" aria-pressed={active.codeBlock}>
        <IconCodeDots size={14} />
      </button>
      <button className={btn} onClick={() => run(insertTableCommand.key)} title="Insert table" aria-label="Insert table">
        <IconTable size={14} />
      </button>
      <button className={btn} onClick={insertImage} title="Insert image" aria-label="Insert image">
        <IconPhoto size={14} />
      </button>
      <button className={btn} onClick={() => run(insertHrCommand.key)} title="Horizontal rule" aria-label="Horizontal rule">
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
