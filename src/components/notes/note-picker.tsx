"use client";

import React, { useMemo, useState } from "react";
import { IconX, IconSearch, IconChevronDown } from "@tabler/icons-react";
import { useNotesStore } from "@/stores/notes-store";
import { Dropdown, DropdownItem } from "@/components/ds/dropdown";
import NoteCard from "@/components/notes/note-card";
import {
  filterAndSortNotes,
  SORT_LABELS,
  SOURCE_LABELS,
  type SortBy,
  type FilterSource,
} from "@/lib/filter-notes";

interface NotePickerProps {
  /** The note already open in the other pane — excluded from the list. */
  currentNoteId: string;
  onPick: (noteId: string) => void;
  onClose: () => void;
}

/**
 * Secondary-note picker for split view. Mirrors the sidebar list (same NoteCard,
 * same filter/sort), but with its OWN local filter state so choosing a compare
 * note never disturbs the sidebar's filters. No multi-select / trash / export.
 */
export default function NotePicker({ currentNoteId, onPick, onClose }: NotePickerProps) {
  const notes = useNotesStore((s) => s.notes);
  const notebooks = useNotesStore((s) => s.notebooks);
  const tags = useNotesStore((s) => s.tags);
  const noteTagMap = useNotesStore((s) => s.noteTagMap);
  const isSaving = useNotesStore((s) => s.isSaving);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("edited");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filterAndSortNotes(notes, notebooks, noteTagMap, {
        searchQuery,
        filterSource,
        filterPinned: "all",
        activeNotebookId,
        filterTagIds: [],
        sortBy,
      }).filter((n) => n.id !== currentNoteId),
    [notes, notebooks, noteTagMap, searchQuery, filterSource, activeNotebookId, sortBy, currentNoteId],
  );

  const notebookLabel =
    activeNotebookId === null
      ? "All notebooks"
      : activeNotebookId === "loose"
        ? "Unassigned"
        : notebooks.find((nb) => nb.id === activeNotebookId)?.name || "Notebook";

  const triggerClass =
    "shrink-0 flex items-center gap-1 px-2 h-7 rounded-[var(--radius-6)] text-[12px] border transition-colors";
  const triggerActive = "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]";
  const triggerIdle = "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 pt-3">
        <p className="text-[13px] font-medium text-[var(--color-ink-2)]">Choose a note to compare</p>
        <button
          onClick={onClose}
          title="Close"
          className="p-1 rounded text-[var(--color-ink-5)] hover:text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <IconX size={15} />
        </button>
      </div>

      {/* Search + filter/sort bar */}
      <div className="flex-none px-3 py-2">
        <div className="relative">
          <IconSearch
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-5)]"
          />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent-fill)] focus:bg-[var(--color-raised)] focus:outline-none transition-all duration-[var(--duration-fast)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-5)] hover:text-[var(--color-ink-3)]"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Dropdown
            placement="bottom-start"
            trigger={
              <button className={`${triggerClass} ${triggerIdle}`}>
                {SORT_LABELS[sortBy]}
                <IconChevronDown size={12} className="opacity-60" />
              </button>
            }
          >
            {(Object.keys(SORT_LABELS) as SortBy[]).map((v) => (
              <DropdownItem key={v} onClick={() => setSortBy(v)}>
                {SORT_LABELS[v]}
              </DropdownItem>
            ))}
          </Dropdown>

          <Dropdown
            placement="bottom-start"
            trigger={
              <button className={`${triggerClass} ${filterSource !== "all" ? triggerActive : triggerIdle}`}>
                {SOURCE_LABELS[filterSource]}
                <IconChevronDown size={12} className="opacity-60" />
              </button>
            }
          >
            {(Object.keys(SOURCE_LABELS) as FilterSource[]).map((v) => (
              <DropdownItem key={v} onClick={() => setFilterSource(v)}>
                {SOURCE_LABELS[v]}
              </DropdownItem>
            ))}
          </Dropdown>

          <Dropdown
            placement="bottom-start"
            trigger={
              <button className={`${triggerClass} ${activeNotebookId !== null ? triggerActive : triggerIdle}`}>
                <span className="truncate max-w-[120px]">{notebookLabel}</span>
                <IconChevronDown size={12} className="opacity-60" />
              </button>
            }
          >
            <DropdownItem onClick={() => setActiveNotebookId(null)}>All notebooks</DropdownItem>
            <DropdownItem onClick={() => setActiveNotebookId("loose")}>Unassigned</DropdownItem>
            {notebooks.map((nb) => (
              <DropdownItem key={nb.id} onClick={() => setActiveNotebookId(nb.id)}>
                {nb.name}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-1 py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-[var(--color-ink-5)]">
            {searchQuery ? `No notes match “${searchQuery}”` : "No other notes to compare."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((n) => (
              <li key={n.id}>
                <div className="group/note relative w-full px-2.5 py-3 md:px-2 md:py-2 text-left transition-colors duration-[var(--duration-fast)] rounded-[var(--radius-8)] border border-transparent hover:bg-[var(--color-raised-soft)] cursor-pointer">
                  <div className="flex items-start gap-1.5">
                    <NoteCard
                      note={n}
                      notebooks={notebooks}
                      tags={tags}
                      noteTagMap={noteTagMap}
                      isSaving={isSaving.has(n.id)}
                      onOpen={() => onPick(n.id)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
