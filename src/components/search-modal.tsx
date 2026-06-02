"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNotesStore } from "@/stores/notes-store";
import { stripContentToText } from "@/utils/html-utils";
import { IconSearch, IconFileText, IconCornerDownLeft } from "@tabler/icons-react";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { notes, setActiveNoteId, notebooks } = useNotesStore();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return notes.slice(0, 8);

    const q = query.toLowerCase();
    return notes
      .filter((note) => {
        const title = note.title?.toLowerCase() || "";
        const isHtml = /<[a-z][\s\S]*>/i.test(note.content);
        const content = stripContentToText(note.content, isHtml ? "html" : "markdown").toLowerCase();
        return title.includes(q) || content.includes(q);
      })
      .slice(0, 10);
  }, [query, notes]);

  const handleSelect = useCallback(
    (noteId: string) => {
      setActiveNoteId(noteId);
      onClose();
    },
    [setActiveNoteId, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex].id);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIndex, handleSelect, onClose],
  );

  if (!open) return null;

  const getNotebookName = (notebookId: string | null | undefined) => {
    if (!notebookId) return null;
    return notebooks.find((nb) => nb.id === notebookId)?.name;
  };

  const getMatchSnippet = (content: string, q: string) => {
    if (!q.trim()) return "";
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    const text = stripContentToText(content, isHtml ? "html" : "markdown");
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return "";
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + q.length + 40);
    return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" />
      <div className="relative w-full max-w-lg mx-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-xl)] shadow-[var(--shadow-modal)] border border-[var(--color-border-secondary)] overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-secondary)]">
          <IconSearch size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search notes..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[9px] bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded text-[var(--color-text-tertiary)] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
              No notes found
            </div>
          ) : (
            <ul>
              {results.map((note, i) => {
                const nbName = getNotebookName(note.notebookId);
                const snippet = query.trim() ? getMatchSnippet(note.content, query) : "";

                return (
                  <li key={note.id}>
                    <button
                      onClick={() => handleSelect(note.id)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors ${
                        i === selectedIndex
                          ? "bg-[var(--color-selected)]"
                          : "hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      <IconFileText size={14} className="text-[var(--color-text-tertiary)] shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                            {note.title}
                          </span>
                          {nbName && (
                            <span className="px-1.5 py-px text-[8px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)] shrink-0">
                              {nbName}
                            </span>
                          )}
                        </div>
                        {snippet && (
                          <p className="text-[10px] text-[var(--color-text-tertiary)] truncate mt-0.5">
                            {snippet}
                          </p>
                        )}
                      </div>
                      {i === selectedIndex && (
                        <IconCornerDownLeft size={12} className="text-[var(--color-text-tertiary)] shrink-0 mt-1" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--color-border-secondary)] flex items-center gap-3 text-[9px] text-[var(--color-text-tertiary)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded font-mono">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
