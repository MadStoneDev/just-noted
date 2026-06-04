"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@milkdown/core";
import { callCommand, insert } from "@milkdown/utils";
import {
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import {
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconCheckbox,
  IconQuote,
  IconMinus,
  IconCodeDots,
  IconTable,
} from "@tabler/icons-react";

interface SlashMenuProps {
  getEditor: () => Editor | undefined;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface SlashItem {
  label: string;
  description: string;
  icon: React.ReactNode;
  action: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    label: "Heading 1",
    description: "Large heading",
    icon: <IconH1 size={16} />,
    action: (e) => e.action(callCommand(wrapInHeadingCommand.key, 1)),
  },
  {
    label: "Heading 2",
    description: "Medium heading",
    icon: <IconH2 size={16} />,
    action: (e) => e.action(callCommand(wrapInHeadingCommand.key, 2)),
  },
  {
    label: "Heading 3",
    description: "Small heading",
    icon: <IconH3 size={16} />,
    action: (e) => e.action(callCommand(wrapInHeadingCommand.key, 3)),
  },
  {
    label: "Bullet List",
    description: "Unordered list",
    icon: <IconList size={16} />,
    action: (e) => e.action(callCommand(wrapInBulletListCommand.key)),
  },
  {
    label: "Numbered List",
    description: "Ordered list",
    icon: <IconListNumbers size={16} />,
    action: (e) => e.action(callCommand(wrapInOrderedListCommand.key)),
  },
  {
    label: "Task List",
    description: "Checklist with checkboxes",
    icon: <IconCheckbox size={16} />,
    action: (e) => e.action(insert("- [ ] ")),
  },
  {
    label: "Blockquote",
    description: "Quote block",
    icon: <IconQuote size={16} />,
    action: (e) => e.action(callCommand(wrapInBlockquoteCommand.key)),
  },
  {
    label: "Code Block",
    description: "Code with syntax highlighting",
    icon: <IconCodeDots size={16} />,
    action: (e) => e.action(callCommand(createCodeBlockCommand.key)),
  },
  {
    label: "Divider",
    description: "Horizontal rule",
    icon: <IconMinus size={16} />,
    action: (e) => e.action(callCommand(insertHrCommand.key)),
  },
];

export default function SlashMenu({ getEditor, containerRef }: SlashMenuProps) {
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = SLASH_ITEMS.filter(
    (item) =>
      !filter ||
      item.label.toLowerCase().includes(filter.toLowerCase()) ||
      item.description.toLowerCase().includes(filter.toLowerCase()),
  );

  const close = useCallback(() => {
    setVisible(false);
    setFilter("");
    setSelectedIndex(0);
  }, []);

  const executeItem = useCallback(
    (item: SlashItem) => {
      const editor = getEditor();
      if (!editor) return;

      // Delete the "/" and any filter text from the editor
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const textNode = range.startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const text = textNode.textContent || "";
            const slashPos = text.lastIndexOf("/");
            if (slashPos >= 0) {
              const newRange = document.createRange();
              newRange.setStart(textNode, slashPos);
              newRange.setEnd(textNode, text.length);
              newRange.deleteContents();
            }
          }
        }
      } catch {}

      try {
        item.action(editor);
      } catch {}

      close();
    },
    [getEditor, close],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInput = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) return;

      if (anchor.nodeType !== Node.TEXT_NODE) return;

      const text = anchor.textContent || "";
      const offset = sel.anchorOffset;
      const before = text.slice(0, offset);

      // Check if "/" is at the start of the line (possibly with filter text after)
      const match = before.match(/\/(\w*)$/);
      if (match && (before === match[0] || before[before.length - match[0].length - 1] === "\n")) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setPos({ x: rect.left, y: rect.bottom + 4 });
        setFilter(match[1]);
        setSelectedIndex(0);
        setVisible(true);
      } else {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        executeItem(filteredItems[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    container.addEventListener("input", handleInput);
    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("input", handleInput);
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, visible, filteredItems, selectedIndex, executeItem, close]);

  if (!visible || filteredItems.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] max-h-[280px] overflow-y-auto py-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-lg animate-scale-in"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      {filteredItems.map((item, i) => (
        <button
          key={item.label}
          onMouseDown={(e) => {
            e.preventDefault();
            executeItem(item);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            i === selectedIndex
              ? "bg-[var(--color-selected)]"
              : "hover:bg-[var(--color-hover)]"
          }`}
        >
          <span className="text-[var(--color-text-tertiary)]">{item.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">{item.label}</p>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">{item.description}</p>
          </div>
        </button>
      ))}
    </div>,
    document.body,
  );
}
