"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useNotesStore } from "@/stores/notes-store";
import {
  IconX,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconCloud,
  IconDeviceFloppy,
  IconFilter,
  IconFilterOff,
} from "@tabler/icons-react";

interface SidebarProps {
  onNoteClick?: (noteId: string) => void;
}

export default function Sidebar({ onNoteClick }: SidebarProps) {
  const {
    sidebarOpen,
    setSidebarOpen,
    searchQuery,
    setSearchQuery,
    filterSource,
    setFilterSource,
    filterPinned,
    setFilterPinned,
    clearFilters,
    activeNoteId,
    setActiveNoteId,
    getFilteredNotes,
    notes,
    isAuthenticated,
  } = useNotesStore();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredNotes = getFilteredNotes();
  const hasActiveFilters = searchQuery || filterSource !== "all" || filterPinned !== "all";

  // Focus search input when sidebar opens
  useEffect(() => {
    if (sidebarOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [sidebarOpen]);

  // Close sidebar on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, setSidebarOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };

    if (sidebarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sidebarOpen, setSidebarOpen]);

  const handleNoteClick = useCallback(
    (noteId: string) => {
      setActiveNoteId(noteId);

      // Close sidebar first on mobile for better UX
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }

      // Small delay to allow sidebar close animation and ensure DOM is ready
      setTimeout(() => {
        const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);
        if (noteElement) {
          // Account for sticky header (64px) plus top bar (~48px)
          const headerOffset = 120;
          const elementPosition = noteElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
          });

          // Add highlight effect
          noteElement.classList.add("ring-2", "ring-mercedes-primary", "ring-offset-2");
          setTimeout(() => {
            noteElement.classList.remove("ring-2", "ring-mercedes-primary", "ring-offset-2");
          }, 2000);
        }
      }, 100);

      onNoteClick?.(noteId);
    },
    [setActiveNoteId, onNoteClick, setSidebarOpen]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, [setSearchQuery]);

  // Strip HTML tags for preview
  const getPlainTextPreview = (html: string, maxLength = 60) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    const text = div.textContent || div.innerText || "";
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
  };

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-800">Notes</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
              aria-label="Close sidebar"
            >
              <IconX size={20} />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-neutral-200">
            <div className="relative">
              <IconSearch
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-10 py-2 bg-neutral-100 rounded-lg border border-transparent focus:border-mercedes-primary focus:bg-white focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <IconX size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-600">Filters</span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-mercedes-primary hover:underline flex items-center gap-1"
                >
                  <IconFilterOff size={14} />
                  Clear
                </button>
              )}
            </div>

            {/* Source filter */}
            <div className="flex gap-2">
              <FilterButton
                active={filterSource === "all"}
                onClick={() => setFilterSource("all")}
              >
                All
              </FilterButton>
              <FilterButton
                active={filterSource === "local"}
                onClick={() => setFilterSource("local")}
              >
                <IconDeviceFloppy size={14} />
                Local
              </FilterButton>
              {isAuthenticated && (
                <FilterButton
                  active={filterSource === "cloud"}
                  onClick={() => setFilterSource("cloud")}
                >
                  <IconCloud size={14} />
                  Cloud
                </FilterButton>
              )}
            </div>

            {/* Pinned filter */}
            <div className="flex gap-2">
              <FilterButton
                active={filterPinned === "all"}
                onClick={() => setFilterPinned("all")}
              >
                All
              </FilterButton>
              <FilterButton
                active={filterPinned === "pinned"}
                onClick={() => setFilterPinned("pinned")}
              >
                <IconPinFilled size={14} />
                Pinned
              </FilterButton>
              <FilterButton
                active={filterPinned === "unpinned"}
                onClick={() => setFilterPinned("unpinned")}
              >
                <IconPin size={14} />
                Unpinned
              </FilterButton>
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="p-4 text-center text-neutral-500">
                {hasActiveFilters ? (
                  <>
                    <p>No notes match your filters</p>
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-sm text-mercedes-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <p>No notes yet</p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200/60">
                {filteredNotes.map((note) => (
                  <li key={note.id}>
                    <button
                      onClick={() => handleNoteClick(note.id)}
                      className={`w-full p-4 text-left hover:bg-neutral-50 transition-colors ${
                        activeNoteId === note.id
                          ? "bg-mercedes-primary/10 border-l-[3px] border-mercedes-primary"
                          : "border-l-[3px] border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {note.isPinned && (
                              <IconPinFilled size={14} className="text-mercedes-primary flex-shrink-0" />
                            )}
                            <h3 className="font-medium text-neutral-800 truncate">
                              {note.title}
                            </h3>
                          </div>
                          <p className="text-sm text-neutral-400/70 truncate mt-1">
                            {getPlainTextPreview(note.content) || "Empty note"}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {note.source === "supabase" ? (
                            <IconCloud size={16} className="text-blue-500" title="Cloud note" />
                          ) : (
                            <IconDeviceFloppy size={16} className="text-orange-500" title="Local note" />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-neutral-200 text-center text-xs text-neutral-500">
            {notes.length} note{notes.length !== 1 ? "s" : ""} total
            {hasActiveFilters && ` • ${filteredNotes.length} shown`}
          </div>
        </div>
      </aside>
    </>
  );
}

// Filter button component
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full flex items-center gap-1 transition-colors ${
        active
          ? "bg-mercedes-primary text-white"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
