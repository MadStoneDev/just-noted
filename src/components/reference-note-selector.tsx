"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { getCoverPreviewColor } from "@/lib/notebook-covers";
import {
  IconSearch,
  IconChevronDown,
  IconX,
  IconClock,
  IconNotebook,
  IconNotes,
} from "@tabler/icons-react";

interface ReferenceNoteSelectorProps {
  onSelect: (noteId: string) => void;
  selectedNoteId: string | null;
  excludeNoteId?: string; // Exclude the main note from selection
}

export default function ReferenceNoteSelector({
  onSelect,
  selectedNoteId,
  excludeNoteId,
}: ReferenceNoteSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { notes, notebooks, activeNoteId } = useNotesStore();

  // Get the selected note details
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId),
    [notes, selectedNoteId]
  );

  // Filter out the excluded note and sort
  const availableNotes = useMemo(() => {
    return notes
      .filter((n) => n.id !== excludeNoteId && n.id !== activeNoteId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, excludeNoteId, activeNoteId]);

  // Get current note's notebook
  const currentNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId),
    [notes, activeNoteId]
  );

  // Filter by search
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return availableNotes;
    const query = searchQuery.toLowerCase();
    return availableNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query)
    );
  }, [availableNotes, searchQuery]);

  // Group notes by category
  const groupedNotes = useMemo(() => {
    const recent = filteredNotes.slice(0, 5);
    const sameNotebook = currentNote?.notebookId
      ? filteredNotes.filter(
          (n) => n.notebookId === currentNote.notebookId && !recent.includes(n)
        )
      : [];
    const others = filteredNotes.filter(
      (n) => !recent.includes(n) && !sameNotebook.includes(n)
    );

    return { recent, sameNotebook, others };
  }, [filteredNotes, currentNote]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (noteId: string) => {
    onSelect(noteId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const getNotebookInfo = (notebookId: string | null | undefined) => {
    if (!notebookId) return null;
    const notebook = notebooks.find((nb) => nb.id === notebookId);
    if (!notebook) return null;
    return {
      name: notebook.name,
      color: getCoverPreviewColor(notebook.coverType, notebook.coverValue),
    };
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors text-sm max-w-[200px]"
      >
        <IconNotes size={16} className="text-neutral-500 flex-shrink-0" />
        <span className="truncate">
          {selectedNote ? selectedNote.title : "Select a note..."}
        </span>
        <IconChevronDown
          size={14}
          className={`text-neutral-400 flex-shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-neutral-200 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-neutral-100">
            <div className="relative">
              <IconSearch
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-md focus:outline-none focus:border-mercedes-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Notes list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="p-4 text-center text-sm text-neutral-500">
                No notes found
              </div>
            ) : (
              <>
                {/* Recent */}
                {groupedNotes.recent.length > 0 && (
                  <NoteGroup
                    title="Recent"
                    icon={<IconClock size={14} />}
                    notes={groupedNotes.recent}
                    selectedNoteId={selectedNoteId}
                    onSelect={handleSelect}
                    getNotebookInfo={getNotebookInfo}
                  />
                )}

                {/* Same Notebook */}
                {groupedNotes.sameNotebook.length > 0 && (
                  <NoteGroup
                    title="Same Notebook"
                    icon={<IconNotebook size={14} />}
                    notes={groupedNotes.sameNotebook}
                    selectedNoteId={selectedNoteId}
                    onSelect={handleSelect}
                    getNotebookInfo={getNotebookInfo}
                  />
                )}

                {/* Others */}
                {groupedNotes.others.length > 0 && (
                  <NoteGroup
                    title="All Notes"
                    icon={<IconNotes size={14} />}
                    notes={groupedNotes.others}
                    selectedNoteId={selectedNoteId}
                    onSelect={handleSelect}
                    getNotebookInfo={getNotebookInfo}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface NoteGroupProps {
  title: string;
  icon: React.ReactNode;
  notes: Array<{
    id: string;
    title: string;
    notebookId?: string | null;
  }>;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  getNotebookInfo: (notebookId: string | null | undefined) => {
    name: string;
    color: string;
  } | null;
}

function NoteGroup({
  title,
  icon,
  notes,
  selectedNoteId,
  onSelect,
  getNotebookInfo,
}: NoteGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
        {icon}
        <span>{title}</span>
      </div>
      {notes.map((note) => {
        const notebookInfo = getNotebookInfo(note.notebookId);
        return (
          <button
            key={note.id}
            onClick={() => onSelect(note.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 transition-colors ${
              note.id === selectedNoteId ? "bg-mercedes-primary/5" : ""
            }`}
          >
            {notebookInfo && (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: notebookInfo.color }}
                title={notebookInfo.name}
              />
            )}
            <span className="text-sm truncate flex-1">{note.title}</span>
            {note.id === selectedNoteId && (
              <span className="text-xs text-mercedes-primary">Selected</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
