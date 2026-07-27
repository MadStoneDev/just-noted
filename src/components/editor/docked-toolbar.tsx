"use client";

import React from "react";
import type { Editor } from "@milkdown/core";
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
import { useFormatCommands } from "./use-format-commands";

interface DockedToolbarProps {
  getEditor: () => Editor | undefined;
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Persistent formatting bar docked to the bottom of the editor (desktop + mobile).
 * Reachable with no selection, and reflects the caret's current formatting.
 */
export default function DockedToolbar({ getEditor, containerRef }: DockedToolbarProps) {
  const { active, actions } = useFormatCommands(getEditor, containerRef);

  const base =
    "flex items-center justify-center size-9 shrink-0 rounded-[var(--radius-sm)] transition-colors cursor-pointer [&_svg]:size-[18px] md:[&_svg]:size-4 md:size-8";
  const idle = "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]";
  const on = "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]";
  const cls = (isOn: boolean) => `${base} ${isOn ? on : idle}`;
  const sep = "w-px self-center h-5 bg-[var(--color-border-secondary)] mx-0.5 shrink-0";

  return (
    <div
      className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      // Keep the editor selection when tapping a button.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-px px-1.5 py-1 overflow-x-auto scrollbar-thin">
        <button className={cls(active.strong)} onClick={actions.bold} title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={active.strong}>
          <IconBold />
        </button>
        <button className={cls(active.emphasis)} onClick={actions.italic} title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={active.emphasis}>
          <IconItalic />
        </button>
        <button className={cls(active.strike)} onClick={actions.strike} title="Strikethrough" aria-label="Strikethrough" aria-pressed={active.strike}>
          <IconStrikethrough />
        </button>
        <button className={cls(active.code)} onClick={actions.code} title="Inline code" aria-label="Inline code" aria-pressed={active.code}>
          <IconCode />
        </button>
        <button className={cls(active.link)} onClick={actions.toggleLink} title="Toggle link" aria-label="Toggle link" aria-pressed={active.link}>
          <IconLink />
        </button>

        <div className={sep} />

        <button className={cls(active.paragraph)} onClick={actions.paragraph} title="Paragraph / body text" aria-label="Paragraph" aria-pressed={active.paragraph}>
          <IconPilcrow />
        </button>
        <button className={cls(active.heading === 1)} onClick={() => actions.heading(1)} title="Heading 1" aria-label="Heading 1" aria-pressed={active.heading === 1}>
          <IconH1 />
        </button>
        <button className={cls(active.heading === 2)} onClick={() => actions.heading(2)} title="Heading 2" aria-label="Heading 2" aria-pressed={active.heading === 2}>
          <IconH2 />
        </button>
        <button className={cls(active.heading === 3)} onClick={() => actions.heading(3)} title="Heading 3" aria-label="Heading 3" aria-pressed={active.heading === 3}>
          <IconH3 />
        </button>

        <div className={sep} />

        <button className={cls(active.bulletList && !active.task)} onClick={() => actions.list("bullet")} title="Bullet list" aria-label="Bullet list" aria-pressed={active.bulletList && !active.task}>
          <IconList />
        </button>
        <button className={cls(active.orderedList)} onClick={() => actions.list("ordered")} title="Numbered list" aria-label="Numbered list" aria-pressed={active.orderedList}>
          <IconListNumbers />
        </button>
        <button className={cls(active.task)} onClick={() => actions.list("task")} title="Task list" aria-label="Task list" aria-pressed={active.task}>
          <IconCheckbox />
        </button>
        <button className={cls(false)} onClick={actions.outdent} title="Outdent" aria-label="Outdent">
          <IconIndentDecrease />
        </button>
        <button className={cls(false)} onClick={actions.indent} title="Indent" aria-label="Indent">
          <IconIndentIncrease />
        </button>

        <div className={sep} />

        <button className={cls(active.blockquote)} onClick={actions.blockquote} title="Blockquote" aria-label="Blockquote" aria-pressed={active.blockquote}>
          <IconQuote />
        </button>
        <button className={cls(active.codeBlock)} onClick={actions.codeBlock} title="Code block" aria-label="Code block" aria-pressed={active.codeBlock}>
          <IconCodeDots />
        </button>
        <button className={cls(false)} onClick={actions.table} title="Insert table" aria-label="Insert table">
          <IconTable />
        </button>
        <button className={cls(false)} onClick={actions.image} title="Insert image" aria-label="Insert image">
          <IconPhoto />
        </button>
        <button className={cls(false)} onClick={actions.hr} title="Horizontal rule" aria-label="Horizontal rule">
          <IconMinus />
        </button>
      </div>
    </div>
  );
}
