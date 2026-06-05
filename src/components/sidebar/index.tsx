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
import { uploadNotebookCover } from "@/utils/storage/cover-upload";
import NotebookSwitcher from "@/components/notebook-switcher";
import NotebookModal from "@/components/notebook-modal";
import { NotebookCoverHeader } from "@/components/notebook-breadcrumb";
import BulkActionBar from "@/components/bulk-action-bar";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { getPlainTextPreview as getPlainTextPreviewUtil } from "@/utils/html-utils";
import {
  IconX,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconCloud,
  IconFilterOff,
  IconCheckbox,
  IconSquare,
  IconSquareCheck,
  IconDeviceDesktop,
  IconLayoutSidebarLeftCollapse,
  IconDots,
  IconTrash,
  IconNotebook,
  IconGripVertical,
  IconPlus,
} from "@tabler/icons-react";
import { Dropdown, DropdownItem, DropdownSeparator, DropdownLabel } from "@/components/ds/dropdown";
import { ConfirmModal } from "@/components/ds/modal";

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

interface SidebarProps {
  onNoteClick?: (noteId: string) => void;
  onBulkDelete?: (noteIds: string[]) => void;
  onDeleteNote?: (noteId: string) => void;
  onMoveNote?: (noteId: string, notebookId: string | null) => void;
  onOpenTrash?: () => void;
  onNewNote?: () => void;
}

export default function Sidebar({ onNoteClick, onBulkDelete, onDeleteNote, onMoveNote, onOpenTrash, onNewNote }: SidebarProps) {
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
    sortBy,
    setSortBy,
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
    recalculateNotebookCounts,
  } = useNotesStore();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [isNotebookModalOpen, setIsNotebookModalOpen] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<Notebook | null>(null);
  // Drag and drop for note reordering
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);

  const filteredNotes = getFilteredNotes();
  const hasActiveFilters = searchQuery || filterSource !== "all" || filterPinned !== "all" || activeNotebookId !== null;
  const deleteNoteTitle = deleteNoteId ? filteredNotes.find(n => n.id === deleteNoteId)?.title || "this note" : "";

  const hasLoadedNotebooks = useRef(false);

  // Focus search input when sidebar opens
  useEffect(() => {
    if (sidebarOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [sidebarOpen]);

  // Load notebooks when authenticated (once)
  useEffect(() => {
    if (isAuthenticated && !hasLoadedNotebooks.current && !notebooksLoading) {
      hasLoadedNotebooks.current = true;
      loadNotebooks();
    }
    // Reset flag when user logs out
    if (!isAuthenticated) {
      hasLoadedNotebooks.current = false;
    }
  }, [isAuthenticated, notebooksLoading]);

  // Recalculate notebook counts locally when notes array length changes
  // Using length instead of full array to avoid excessive recalculations
  const notesLength = notes.length;
  const supabaseNotesFingerprint = notes
    .filter(n => n.source === "supabase")
    .map(n => `${n.id}:${n.notebookId || ""}`)
    .join(",");

  useEffect(() => {
    if (isAuthenticated) {
      recalculateNotebookCounts();
    }
  }, [isAuthenticated, notesLength, supabaseNotesFingerprint, recalculateNotebookCounts]);

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
          noteElement.classList.add("ring-2", "ring-[var(--color-accent)]", "ring-offset-2");
          setTimeout(() => {
            noteElement.classList.remove("ring-2", "ring-[var(--color-accent)]", "ring-offset-2");
          }, 2000);
        }
      }, 100);

      onNoteClick?.(noteId);
    },
    [setActiveNoteId, onNoteClick, setSidebarOpen]
  );

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalSearchQuery(value);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    },
    [setSearchQuery]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery("");
    setSearchQuery("");
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
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

  // Notebook handlers - memoized to prevent unnecessary re-renders
  const handleNewNotebook = useCallback(() => {
    setEditingNotebook(null);
    setIsNotebookModalOpen(true);
  }, []);

  const handleEditNotebook = useCallback((notebook: Notebook) => {
    setEditingNotebook(notebook);
    setIsNotebookModalOpen(true);
  }, []);

  const handleCloseNotebookModal = useCallback(() => {
    setIsNotebookModalOpen(false);
    setEditingNotebook(null);
  }, []);

  const handleDeleteNotebookFromSwitcher = useCallback(async (notebook: Notebook) => {
    // Confirm deletion
    if (!confirm(`Delete "${notebook.name}"? Notes in this notebook will become loose notes.`)) {
      return;
    }

    try {
      const result = await deleteNotebook(notebook.id);
      if (result.success) {
        removeNotebook(notebook.id);
        recalculateNotebookCounts();
      } else {
        console.error("Failed to delete notebook:", result.error);
      }
    } catch (error) {
      console.error("Failed to delete notebook:", error);
    }
  }, [removeNotebook, recalculateNotebookCounts]);


  const handleSaveNotebook = useCallback(async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
    wordGoal?: number;
  }) => {
    if (editingNotebook) {
      // Update existing notebook
      let finalCoverType = data.coverType;
      let finalCoverValue = data.coverValue;

      // If there's a pending file, upload it first
      if (data.pendingFile) {
        const uploadedUrl = await uploadNotebookCover(editingNotebook.id, data.pendingFile);
        if (uploadedUrl) {
          finalCoverType = "custom";
          finalCoverValue = uploadedUrl;
        } else {
          throw new Error("Upload failed — check browser console for details.");
        }
      }

      const result = await updateNotebook(editingNotebook.id, {
        name: data.name,
        coverType: finalCoverType,
        coverValue: finalCoverValue,
        wordGoal: data.wordGoal,
      });

      if (result.success && result.notebook) {
        updateNotebookInStore(editingNotebook.id, result.notebook);
      } else {
        throw new Error(result.error || "Failed to update notebook");
      }
    } else {
      // Create new notebook (with default cover initially if uploading)
      const createData = {
        name: data.name,
        coverType: data.pendingFile ? "color" as CoverType : data.coverType,
        coverValue: data.pendingFile ? "#6366f1" : data.coverValue,
      };

      const result = await createNotebook(createData);
      if (result.success && result.notebook) {
        addNotebook(result.notebook);

        // If there's a pending file, upload it now
        if (data.pendingFile) {
          const uploadedUrl = await uploadNotebookCover(result.notebook.id, data.pendingFile);
          if (uploadedUrl) {
            // Update notebook with uploaded cover
            const updateResult = await updateNotebook(result.notebook.id, {
              coverType: "custom",
              coverValue: uploadedUrl,
            });

            if (updateResult.success) {
              updateNotebookInStore(result.notebook.id, {
                coverType: "custom",
                coverValue: uploadedUrl,
              });
            } else {
              console.error("Failed to update notebook with cover:", updateResult.error);
            }
          } else {
            console.error("Failed to upload cover file for new notebook");
            // Don't throw here - notebook was created, just cover failed
          }
        }
      } else {
        throw new Error(result.error || "Failed to create notebook");
      }
    }
  }, [editingNotebook, updateNotebookInStore, addNotebook]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!editingNotebook) return;

    const result = await deleteNotebook(editingNotebook.id);
    if (result.success) {
      removeNotebook(editingNotebook.id);
      recalculateNotebookCounts();
    } else {
      throw new Error(result.error || "Failed to delete notebook");
    }
  }, [editingNotebook, removeNotebook, recalculateNotebookCounts]);

  const getPreview = (content: string, maxLength = 60) => {
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    return getPlainTextPreviewUtil(content, maxLength, isHtml ? "html" : "markdown");
  };

  return (
    <>
      {/* Overlay for mobile — tap to close */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-[var(--duration-slow)] ${
          sidebarOpen
            ? "bg-[var(--color-bg-overlay)] opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar — single element, animates between 48px (rail) and 248px (expanded) on desktop */}
      <aside
        ref={sidebarRef}
        className="fixed md:relative top-0 left-0 h-full z-50 md:z-auto bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-secondary)] transition-all duration-[var(--duration-slow)] overflow-hidden"
        style={{
          transitionTimingFunction: "var(--ease-spring)",
          flexShrink: 0,
          width: sidebarOpen ? 248 : 0,
        }}
      >
        {/* Mobile: slide off-screen when closed. Desktop: handled by width. */}
        <div
          className="flex flex-col h-full"
          style={{ width: 248, minWidth: 248 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight">Notes</h2>
            <div className="flex items-center gap-0.5">
              <button
                onClick={onNewNote}
                className="p-2 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]"
                aria-label="New note (Ctrl+J)"
                title="New note (Ctrl+J)"
              >
                <IconPlus size={16} />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)]"
                aria-label="Close sidebar (Ctrl+\)"
                title="Close sidebar (Ctrl+\)"
              >
                <IconX size={16} className="md:hidden" />
                <IconLayoutSidebarLeftCollapse size={16} className="hidden md:block" />
              </button>
            </div>
          </div>

          {/* Notebook Switcher (authenticated users only) */}
          {isAuthenticated && (
            <div className="px-3 py-3 border-b border-[var(--color-border-secondary)]">
              <NotebookSwitcher
                onNewNotebook={handleNewNotebook}
                onEditNotebook={handleEditNotebook}
                onDeleteNotebook={handleDeleteNotebookFromSwitcher}
              />
            </div>
          )}

          {/* Notebook Cover Header (when viewing specific notebook) */}
          {isAuthenticated && activeNotebookId && <NotebookCoverHeader />}

          {/* Search */}
          <div className="px-3 py-3 border-b border-[var(--color-border-secondary)]">
            <div className="relative">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes..."
                value={localSearchQuery}
                onChange={handleSearchChange}
                className="w-full pl-9 pr-9 py-2 text-sm bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-border-focus)] focus:bg-[var(--color-bg-primary)] focus:outline-none transition-all duration-[var(--duration-fast)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
              />
              {localSearchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 py-3 border-b border-[var(--color-border-secondary)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Filters</span>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] flex items-center gap-1 transition-colors"
                  >
                    <IconFilterOff size={12} />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-tertiary)]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] border-none px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="manual">Manual</option>
                <option value="edited">Last Edited</option>
                <option value="created">Date Created</option>
                <option value="title">Title A-Z</option>
                <option value="notebook">Notebook</option>
              </select>
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
                <IconDeviceDesktop size={14} />
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

            {/* Select mode toggle */}
            {isAuthenticated && (
              <div className="pt-2 border-t border-[var(--color-border-secondary)]">
                <button
                  onClick={handleToggleSelectMode}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] ${
                    selectMode
                      ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
                  }`}
                >
                  <IconCheckbox size={14} />
                  {selectMode ? "Done" : "Bulk Actions"}
                </button>
              </div>
            )}
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredNotes.length === 0 ? (
              <div className="p-6 text-center">
                {hasActiveFilters ? (
                  <>
                    <p className="text-sm text-[var(--color-text-tertiary)]">No notes match your filters</p>
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-text-tertiary)]">No notes yet</p>
                )}
              </div>
            ) : (
              <ul className="flex flex-col p-1.5">
                {filteredNotes.map((note, noteIndex) => {
                  const isSelected = selectedNoteIds.has(note.id);
                  const canSelect = selectMode && note.source === "supabase";
                  const isActive = activeNoteId === note.id;
                  const shortcutKey = noteIndex < 9 ? noteIndex + 1 : noteIndex === 9 ? 0 : null;

                  return (
                  <li
                    key={note.id}
                    draggable={!selectMode}
                    onDragStart={(e) => {
                      setDraggedNoteId(note.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedNoteId && note.id !== draggedNoteId) setDragOverNoteId(note.id);
                    }}
                    onDragLeave={() => setDragOverNoteId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverNoteId(null);
                      if (!draggedNoteId || draggedNoteId === note.id) return;
                      // Reorder: move dragged note to this position
                      const { notes: allNotes, optimisticReorderNotes } = useNotesStore.getState();
                      const from = allNotes.findIndex(n => n.id === draggedNoteId);
                      const to = allNotes.findIndex(n => n.id === note.id);
                      if (from !== -1 && to !== -1) {
                        const reordered = [...allNotes];
                        const [moved] = reordered.splice(from, 1);
                        reordered.splice(to, 0, moved);
                        optimisticReorderNotes(reordered.map((n, i) => ({ ...n, order: i })));
                      }
                      setDraggedNoteId(null);
                    }}
                    onDragEnd={() => { setDraggedNoteId(null); setDragOverNoteId(null); }}
                    className={dragOverNoteId === note.id ? "border-t border-[var(--color-accent)]" : ""}
                  >
                    <div
                      className={`group/note relative w-full px-1 py-2.5 text-left transition-colors duration-[var(--duration-fast)] rounded-[var(--radius-md)] ${
                        draggedNoteId === note.id ? "opacity-40" : ""
                      } ${
                        isSelected
                          ? "bg-[var(--color-selected)]"
                          : isActive
                            ? "bg-[var(--color-selected)]"
                            : "hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      {isActive && !selectMode && (
                        <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[var(--color-accent)]" />
                      )}
                      {shortcutKey !== null && !selectMode && (
                        <span className="absolute top-1 right-1 text-[8px] font-mono text-[var(--color-text-tertiary)] opacity-0 group-hover/note:opacity-50 transition-opacity" title={`Ctrl+Alt+${shortcutKey}`}>
                          {shortcutKey}
                        </span>
                      )}
                      <div className="flex items-start gap-1.5">
                        {/* Drag handle */}
                        {!selectMode && (
                          <div className="flex-shrink-0 pt-1 cursor-grab opacity-0 group-hover/note:opacity-40 transition-opacity">
                            <IconGripVertical size={10} />
                          </div>
                        )}
                        {selectMode && (
                          <div className="flex-shrink-0 pt-0.5" onClick={() => handleToggleNoteSelection(note.id)}>
                            {note.source === "supabase" ? (
                              isSelected ? (
                                <IconSquareCheck size={16} className="text-[var(--color-accent)]" />
                              ) : (
                                <IconSquare size={16} className="text-[var(--color-text-tertiary)]" />
                              )
                            ) : (
                              <IconSquare size={16} className="text-[var(--color-border-primary)]" />
                            )}
                          </div>
                        )}
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => {
                            if (selectMode && canSelect) {
                              handleToggleNoteSelection(note.id);
                            } else {
                              handleNoteClick(note.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            {note.isPinned && (
                              <IconPinFilled size={10} className="text-[var(--color-accent)] flex-shrink-0" />
                            )}
                            <h3 className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                              {note.title}
                            </h3>
                          </div>
                          {note.notebookId && (() => {
                            const notebook = notebooks.find((nb) => nb.id === note.notebookId);
                            if (notebook) {
                              return (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-px text-[9px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)] truncate max-w-[130px]">
                                  <IconNotebook size={8} className="shrink-0" />
                                  {notebook.name}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          <p className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5 leading-relaxed">
                            {getPreview(note.content) || "Empty note"}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {note.source === "supabase" ? (
                              <IconCloud size={9} className="text-[var(--color-info)] flex-shrink-0" />
                            ) : (
                              <IconDeviceDesktop size={9} className="text-[var(--color-warning)] flex-shrink-0" />
                            )}
                            <p className="text-[9px] text-[var(--color-text-tertiary)] opacity-50">
                              {relativeTime(note.updatedAt)}
                            </p>
                          </div>
                        </div>
                        {/* Actions menu */}
                        {!selectMode && (
                          <div className="flex-shrink-0 opacity-0 group-hover/note:opacity-100 transition-opacity">
                            <Dropdown
                              trigger={
                                <button className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors">
                                  <IconDots size={12} />
                                </button>
                              }
                              placement="bottom-end"
                            >
                              {isAuthenticated && notebooks.length > 0 && (
                                <>
                                  <DropdownLabel>Move to</DropdownLabel>
                                  {note.notebookId && (
                                    <DropdownItem
                                      icon={<IconX size={12} />}
                                      onClick={() => onMoveNote?.(note.id, null)}
                                    >
                                      Remove from notebook
                                    </DropdownItem>
                                  )}
                                  {notebooks
                                    .filter(nb => nb.id !== note.notebookId)
                                    .map(nb => (
                                      <DropdownItem
                                        key={nb.id}
                                        icon={<IconNotebook size={12} />}
                                        onClick={() => onMoveNote?.(note.id, nb.id)}
                                      >
                                        {nb.name}
                                      </DropdownItem>
                                    ))
                                  }
                                  <DropdownSeparator />
                                </>
                              )}
                              <DropdownItem
                                icon={<IconTrash size={12} />}
                                destructive
                                onClick={() => setDeleteNoteId(note.id)}
                              >
                                Delete
                              </DropdownItem>
                            </Dropdown>
                          </div>
                        )}
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
              onBulkDelete={onBulkDelete}
            />
          )}

          {/* Footer */}
          {!selectMode && (
            <div className="px-3 py-2.5 border-t border-[var(--color-border-secondary)] flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
              <span>
                {notes.length} note{notes.length !== 1 ? "s" : ""}
                {hasActiveFilters && ` · ${filteredNotes.length} shown`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenTrash?.()}
                  className="hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-0.5"
                  title="Trash"
                >
                  <IconTrash size={10} />
                  Trash
                </button>
                <span>·</span>
                <button
                  onClick={() => {
                    import("@/utils/export-notes").then(({ exportAsMarkdownZip }) => {
                      exportAsMarkdownZip(notes);
                    });
                  }}
                  className="hover:text-[var(--color-text-secondary)] transition-colors"
                  title="Export all notes"
                >
                  Export
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Notebook Modal */}
      <NotebookModal
        isOpen={isNotebookModalOpen}
        onClose={handleCloseNotebookModal}
        notebook={editingNotebook}
        onSave={handleSaveNotebook}
        onDelete={editingNotebook ? handleDeleteNotebook : undefined}
      />

      <ConfirmModal
        open={!!deleteNoteId}
        onClose={() => setDeleteNoteId(null)}
        onConfirm={() => {
          if (deleteNoteId) {
            onDeleteNote?.(deleteNoteId);
            setDeleteNoteId(null);
          }
        }}
        title="Delete note"
        message={`Delete "${deleteNoteTitle}"? This can't be undone.`}
        confirmText="Delete"
        destructive
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
      className={`px-2.5 py-1.5 text-xs rounded-[var(--radius-md)] flex items-center gap-1 transition-colors duration-[var(--duration-fast)] ${
        active
          ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
          : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
      }`}
    >
      {children}
    </button>
  );
}
