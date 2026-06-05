"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import { callCommand } from "@milkdown/utils";
import { toggleLinkCommand, updateLinkCommand } from "@milkdown/preset-commonmark";
import {
  IconLink,
  IconPencil,
  IconTrash,
  IconExternalLink,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

interface LinkPopoverProps {
  getEditor: () => Editor | undefined;
  containerRef: React.RefObject<HTMLElement | null>;
}

export default function LinkPopover({ getEditor, containerRef }: LinkPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [href, setHref] = useState("");
  const [editHref, setEditHref] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [anchorEl, setAnchorEl] = useState<HTMLAnchorElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a") as HTMLAnchorElement | null;

      if (link && container.contains(link)) {
        const rect = link.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
        setHref(link.getAttribute("href") || "");
        setEditHref(link.getAttribute("href") || "");
        setAnchorEl(link);
        setEditing(false);
        setVisible(true);
      } else if (!(e.target as HTMLElement).closest("[data-link-popover]")) {
        setVisible(false);
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    const editor = getEditor();
    if (!editor || !anchorEl) return;

    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as any;
        const pos = view.posAtDOM(anchorEl, 0);
        const { state } = view;
        const resolved = state.doc.resolve(pos);
        const linkMark = resolved.marks().find((m: any) => m.type.name === "link");

        if (linkMark) {
          const from = resolved.pos - resolved.textOffset;
          const to = from + resolved.parent.child(resolved.index()).nodeSize;
          const tr = state.tr
            .removeMark(from, to, linkMark.type)
            .addMark(from, to, linkMark.type.create({ href: editHref, title: linkMark.attrs.title }));
          view.dispatch(tr);
        }
      });
    } catch {}

    setHref(editHref);
    setEditing(false);
  }, [getEditor, anchorEl, editHref]);

  const handleRemove = useCallback(() => {
    const editor = getEditor();
    if (!editor || !anchorEl) return;

    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as any;
        const pos = view.posAtDOM(anchorEl, 0);
        const { state } = view;
        const resolved = state.doc.resolve(pos);
        const linkMark = resolved.marks().find((m: any) => m.type.name === "link");

        if (linkMark) {
          const from = resolved.pos - resolved.textOffset;
          const to = from + resolved.parent.child(resolved.index()).nodeSize;
          const tr = state.tr.removeMark(from, to, linkMark.type);
          view.dispatch(tr);
        }
      });
    } catch {}

    setVisible(false);
  }, [getEditor, anchorEl]);

  if (!visible) return null;

  return createPortal(
    <div
      data-link-popover
      className="fixed z-[9999] animate-fade-in"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-lg overflow-hidden">
        {editing ? (
          <div className="flex items-center gap-1 p-1.5">
            <input
              ref={inputRef}
              type="url"
              value={editHref}
              onChange={(e) => setEditHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-48 h-7 px-2 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none"
              placeholder="https://"
            />
            <button
              onClick={handleSave}
              className="p-1.5 text-[var(--color-success)] hover:bg-[var(--color-hover)] rounded-[var(--radius-sm)] transition-colors"
            >
              <IconCheck size={14} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-sm)] transition-colors"
            >
              <IconX size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 p-1">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] truncate max-w-[180px] transition-colors"
              title={href}
            >
              <IconExternalLink size={12} className="shrink-0" />
              {href}
            </a>
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-sm)] transition-colors"
              title="Edit link"
            >
              <IconPencil size={12} />
            </button>
            <button
              onClick={handleRemove}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-hover)] rounded-[var(--radius-sm)] transition-colors"
              title="Remove link"
            >
              <IconTrash size={12} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
