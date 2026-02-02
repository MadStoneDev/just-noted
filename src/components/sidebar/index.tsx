"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { Notebook, CoverType } from "@/types/notebook";
import {
  getNotebooks,
  createNotebook,
  updateNotebook,
  deleteNotebook,
  getNotebookNoteCounts,
} from "@/app/actions/notebookActions";
import { uploadNotebookCover } from "@/app/actions/notebookCoverActions";
import NotebookSwitcher from "@/components/notebook-switcher";
import NotebookModal from "@/components/notebook-modal";
import { NotebookCoverHeader } from "@/components/notebook-breadcrumb";
import BulkActionBar from "@/components/bulk-action-bar";
import { getCoverPreviewColor } from "@/lib/notebook-covers";
import {
  IconX,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconCloud,
  IconDeviceFloppy,
  IconFilterOff,
  IconCheckbox,
  IconSquare,
  IconSquareCheck,
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
    notebooks,
    setNotebooks,
    activeNotebookId,
    notebooksLoading,
    setNotebooksLoading,
    addNotebook,
    updateNotebook: updateNotebookInStore,
    removeNotebook,
    updateNotebookCounts,
  } = useNotesStore();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [isNotebookModalOpen, setIsNotebookModalOpen] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<Notebook | null>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const filteredNotes = getFilteredNotes();
  const hasActiveFilters = searchQuery || filterSource !== "all" || filterPinned !== "all" || activeNotebookId !== null;

  // Focus search input when sidebar opens
  useEffect(() => {
    if (sidebarOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [sidebarOpen]);

  // Load notebooks when authenticated and sidebar opens
  useEffect(() => {
    if (isAuthenticated && sidebarOpen && notebooks.length === 0 && !notebooksLoading) {
      loadNotebooks();
    }
  }, [isAuthenticated, sidebarOpen]);

  // Load notebook counts when notes change
  useEffect(() => {
    if (isAuthenticated && notebooks.length > 0) {
      loadNotebookCounts();
    }
  }, [isAuthenticated, notes.length, notebooks.length]);

  const loadNotebooks = async () => {
    setNotebooksLoading(true);
    try {
      const result = await getNotebooks();
      if (result.success && result.notebooks) {
        setNotebooks(result.notebooks);
      }
    } catch (error) {
      console.error("Failed to load notebooks:", error);
    } finally {
      setNotebooksLoading(false);
    }
  };

  const loadNotebookCounts = async () => {
    try {
      const result = await getNotebookNoteCounts();
      if (result.success) {
        updateNotebookCounts(result.counts || {}, result.looseCount || 0);
      }
    } catch (error) {
      console.error("Failed to load notebook counts:", error);
    }
  };

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

  // Multi-select handlers
  const handleToggleSelectMode = useCallback(() => {
    setSelectMode((prev) => !prev);
    if (selectMode) {
      setSelectedNoteIds(new Set());
    }
  }, [selectMode]);

  const handleToggleNoteSelection = useCallback((noteId: string) => {
    setSelectedNoteIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
    setSelectMode(false);
  }, []);

  const handleBulkAssignComplete = useCallback(() => {
    loadNotebookCounts();
  }, []);

  // Notebook handlers
  const handleNewNotebook = () => {
    setEditingNotebook(null);
    setIsNotebookModalOpen(true);
  };

  const handleManageNotebooks = () => {
    // For now, just open the modal without a specific notebook
    // In the future, this could open a dedicated management view
    setEditingNotebook(null);
    setIsNotebookModalOpen(true);
  };

  const handleEditNotebook = (notebook: Notebook) => {
    setEditingNotebook(notebook);
    setIsNotebookModalOpen(true);
  };

  const handleSaveNotebook = async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
  }) => {
    if (editingNotebook) {
      // Update existing notebook
      const result = await updateNotebook(editingNotebook.id, data);
      if (result.success && result.notebook) {
        updateNotebookInStore(editingNotebook.id, result.notebook);
      } else {
        throw new Error(result.error || "Failed to update notebook");
      }
    } else {
      // Create new notebook
      const result = await createNotebook(data);
      if (result.success && result.notebook) {
        addNotebook(result.notebook);
      } else {
        throw new Error(result.error || "Failed to create notebook");
      }
    }
  };

  const handleDeleteNotebook = async () => {
    if (!editingNotebook) return;

    const result = await deleteNotebook(editingNotebook.id);
    if (result.success) {
      removeNotebook(editingNotebook.id);
    } else {
      throw new Error(result.error || "Failed to delete notebook");
    }
  };

  const handleUploadCover = async (file: File): Promise<string | null> => {
    if (!editingNotebook) return null;

    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadNotebookCover(editingNotebook.id, formData);
    if (result.success && result.url) {
      return result.url;
    }
    return null;
  };

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

          {/* Notebook Switcher (authenticated users only) */}
          {isAuthenticated && (
            <div className="p-4 border-b border-neutral-200">
              <NotebookSwitcher
                onNewNotebook={handleNewNotebook}
                onManageNotebooks={handleManageNotebooks}
              />
            </div>
          )}

          {/* Notebook Cover Header (when viewing specific notebook) */}
          {isAuthenticated && activeNotebookId && <NotebookCoverHeader />}

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

            {/* Select mode toggle (authenticated + cloud notes only) */}
            {isAuthenticated && (
              <div className="pt-2 border-t border-neutral-100">
                <button
                  onClick={handleToggleSelectMode}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-full transition-colors ${
                    selectMode
                      ? "bg-mercedes-primary text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <IconCheckbox size={14} />
                  {selectMode ? "Exit Select Mode" : "Select Multiple"}
                </button>
              </div>
            )}
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
                {filteredNotes.map((note) => {
                  const isSelected = selectedNoteIds.has(note.id);
                  const canSelect = selectMode && note.source === "supabase";

                  return (
                  <li key={note.id}>
                    <div
                      onClick={() => {
                        if (canSelect) {
                          handleToggleNoteSelection(note.id);
                        } else {
                          handleNoteClick(note.id);
                        }
                      }}
                      className={`w-full p-4 text-left hover:bg-neutral-50 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-mercedes-primary/20 border-l-[3px] border-mercedes-primary"
                          : activeNoteId === note.id
                            ? "bg-mercedes-primary/10 border-l-[3px] border-mercedes-primary"
                            : "border-l-[3px] border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Checkbox for select mode */}
                        {selectMode && (
                          <div className="flex-shrink-0 pt-0.5">
                            {note.source === "supabase" ? (
                              isSelected ? (
                                <IconSquareCheck size={18} className="text-mercedes-primary" />
                              ) : (
                                <IconSquare size={18} className="text-neutral-400" />
                              )
                            ) : (
                              <IconSquare size={18} className="text-neutral-200" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {note.isPinned && (
                              <IconPinFilled size={14} className="text-mercedes-primary flex-shrink-0" />
                            )}
                            {/* Notebook indicator */}
                            {note.notebookId && (() => {
                              const notebook = notebooks.find((nb) => nb.id === note.notebookId);
                              if (notebook) {
                                return (
                                  <div
                                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                    style={{
                                      backgroundColor: getCoverPreviewColor(
                                        notebook.coverType,
                                        notebook.coverValue
                                      ),
                                    }}
                                    title={notebook.name}
                                  />
                                );
                              }
                              return null;
                            })()}
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
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Bulk Action Bar */}
          {selectMode && (
            <BulkActionBar
              selectedNoteIds={selectedNoteIds}
              onClearSelection={handleClearSelection}
              onAssignComplete={handleBulkAssignComplete}
            />
          )}

          {/* Footer */}
          {!selectMode && (
            <div className="p-4 border-t border-neutral-200 text-center text-xs text-neutral-500">
              {notes.length} note{notes.length !== 1 ? "s" : ""} total
              {hasActiveFilters && ` • ${filteredNotes.length} shown`}
            </div>
          )}
        </div>
      </aside>

      {/* Notebook Modal */}
      <NotebookModal
        isOpen={isNotebookModalOpen}
        onClose={() => {
          setIsNotebookModalOpen(false);
          setEditingNotebook(null);
        }}
        notebook={editingNotebook}
        onSave={handleSaveNotebook}
        onDelete={editingNotebook ? handleDeleteNotebook : undefined}
        onUploadCover={editingNotebook ? handleUploadCover : undefined}
      />
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
