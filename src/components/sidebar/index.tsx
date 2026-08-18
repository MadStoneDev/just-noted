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
import NotebookNavList from "@/components/notebook-nav-list";
import NotebookModal from "@/components/notebook-modal";
import TagFilter from "@/components/tag-filter";
import WritingSessionIndicator from "@/components/writing-session-indicator";
import { getTags, bulkGetNoteTags } from "@/app/actions/tagActions";
import BulkActionBar from "@/components/bulk-action-bar";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { getPlainTextPreview as getPlainTextPreviewUtil } from "@/utils/html-utils";
import NotebookMoveMenu from "@/components/notebook-move-menu";
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
  IconChevronDown,
  IconAdjustmentsHorizontal,
  IconBook,
  IconTag,
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
    setActiveNotebookId,
    notebooksLoading,
    setNotebooksLoading,
    addNotebook,
    updateNotebook: updateNotebookInStore,
    removeNotebook,
    updateNotebookCounts,
    recalculateNotebookCounts,
    tags,
    noteTagMap,
    setTags,
    setNoteTagMap,
    setTagsLoading,
    filterTagIds,
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

  // Rail navigation: which panel the content column shows
  const [railView, setRailView] = useState<"notes" | "notebooks" | "tags">("notes");
  // Filters live in a slide-up sheet, out of the list's way
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const filteredNotes = getFilteredNotes();
  const hasActiveFilters = searchQuery || filterSource !== "all" || filterPinned !== "all" || activeNotebookId !== null || filterTagIds.length > 0;
  // Count of active filter dimensions (for the rail badge)
  const activeFilterCount =
    (filterSource !== "all" ? 1 : 0) +
    (filterPinned !== "all" ? 1 : 0) +
    (filterTagIds.length > 0 ? 1 : 0);
  // Label for the notes-view header (current notebook context)
  const viewContextName =
    activeNotebookId === null
      ? "All Notes"
      : activeNotebookId === "loose"
        ? "Loose Notes"
        : notebooks.find((nb) => nb.id === activeNotebookId)?.name || "Notes";
  const deleteNoteTitle = deleteNoteId ? filteredNotes.find(n => n.id === deleteNoteId)?.title || "this note" : "";

  const hasLoadedNotebooks = useRef(false);

  // Focus search input when sidebar opens
  useEffect(() => {
    if (sidebarOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [sidebarOpen]);

  // Load notebooks and tags when authenticated (once)
  useEffect(() => {
    if (isAuthenticated && !hasLoadedNotebooks.current && !notebooksLoading) {
      hasLoadedNotebooks.current = true;
      loadNotebooks();
      loadTags();
    }
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

  const loadTags = async () => {
    setTagsLoading(true);
    try {
      const result = await getTags();
      if (result.success && result.tags) {
        setTags(result.tags);
      }
    } catch (error) {
      console.error("Failed to load tags:", error);
    } finally {
      setTagsLoading(false);
    }
  };

  // Load note-tag assignments when supabase notes change
  const supabaseNoteIds = notes
    .filter((n) => n.source === "supabase")
    .map((n) => n.id);
  const supabaseNoteIdsKey = supabaseNoteIds.join(",");

  useEffect(() => {
    if (!isAuthenticated || supabaseNoteIds.length === 0) return;
    bulkGetNoteTags(supabaseNoteIds).then((result) => {
      if (result.success && result.noteTagMap) {
        setNoteTagMap(result.noteTagMap);
      }
    });
  }, [isAuthenticated, supabaseNoteIdsKey]);

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
    isHidden?: boolean;
    parentId?: string | null;
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
        isHidden: data.isHidden,
        parentId: data.parentId !== undefined ? data.parentId : undefined,
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
        parentId: data.parentId || undefined,
      };

      const result = await createNotebook(createData);
      if (result.success && result.notebook) {
        // Set hidden if toggled on during creation
        if (data.isHidden) {
          const hideResult = await updateNotebook(result.notebook.id, { isHidden: true });
          if (hideResult.success && hideResult.notebook) {
            addNotebook(hideResult.notebook);
          } else {
            addNotebook(result.notebook);
          }
        } else {
          addNotebook(result.notebook);
        }

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

      {/* Sidebar — full-width drawer on mobile (below the header); animates
          between 0 and 248px on desktop. */}
      <aside
        ref={sidebarRef}
        className={`fixed md:relative top-14 md:top-0 left-0 h-[calc(100dvh-56px)] md:h-full z-40 md:z-auto bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-secondary)] transition-all duration-[var(--duration-slow)] overflow-hidden ${
          sidebarOpen ? "w-full md:w-[300px]" : "w-0"
        }`}
        style={{
          transitionTimingFunction: "var(--ease-spring)",
          flexShrink: 0,
        }}
      >
        {/* Fixed inner width so content doesn't reflow while the aside animates:
            full viewport width on mobile, 248px on desktop. */}
        <div className="flex h-full w-screen md:w-[300px]">
          {/* Icon rail — primary navigation */}
          <nav className="w-14 flex-none flex flex-col items-center gap-1 py-2 border-r border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
            {isAuthenticated && (
              <RailButton
                label="All notes"
                active={railView === "notes"}
                onClick={() => { setActiveNotebookId(null); setRailView("notes"); }}
              >
                <IconNotebook size={20} />
              </RailButton>
            )}
            {isAuthenticated && (
              <RailButton
                label="Notebooks"
                active={railView === "notebooks"}
                onClick={() => setRailView("notebooks")}
              >
                <IconBook size={20} />
              </RailButton>
            )}
            {isAuthenticated && tags.length > 0 && (
              <RailButton
                label="Tags"
                active={railView === "tags"}
                onClick={() => setRailView("tags")}
              >
                <IconTag size={20} />
              </RailButton>
            )}
            <div className="flex-1" />
            <RailButton label="Filters & sort" badge={activeFilterCount} onClick={() => setFilterSheetOpen(true)}>
              <IconAdjustmentsHorizontal size={20} />
            </RailButton>
            <RailButton label="New note (Ctrl+J)" accent onClick={onNewNote}>
              <IconPlus size={20} />
            </RailButton>
            <RailButton label="Close sidebar (Ctrl+\)" onClick={() => setSidebarOpen(false)}>
              <IconX size={20} className="md:hidden" />
              <IconLayoutSidebarLeftCollapse size={20} className="hidden md:block" />
            </RailButton>
          </nav>

          {/* Content column */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* View header */}
            <div className="flex items-center justify-between px-3 h-[52px] flex-none border-b border-[var(--color-border-secondary)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight truncate">
                {railView === "notebooks" ? "Notebooks" : railView === "tags" ? "Tags" : viewContextName}
              </h2>
              {railView === "notes" && hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] flex items-center gap-1 transition-colors flex-none"
                >
                  <IconFilterOff size={12} />
                  Clear
                </button>
              )}
            </div>

            {/* ===== NOTES VIEW ===== */}
            {railView === "notes" && (
            <>
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
                className="w-full pl-9 pr-9 py-2 text-base md:text-sm bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-border-focus)] focus:bg-[var(--color-bg-primary)] focus:outline-none transition-all duration-[var(--duration-fast)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
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
                          <div className="flex items-start gap-1.5">
                            {note.isPinned && (
                              <IconPinFilled size={10} className="mt-[3px] text-[var(--color-accent)] flex-shrink-0" />
                            )}
                            <h3 className="text-[13px] font-medium text-[var(--color-text-primary)] break-words">
                              {note.title}
                            </h3>
                          </div>
                          {note.notebookId && (() => {
                            const notebook = notebooks.find((nb) => nb.id === note.notebookId);
                            if (notebook) {
                              return (
                                <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-px text-[11px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)] truncate max-w-[150px]">
                                  <IconNotebook size={10} className="shrink-0" />
                                  {notebook.name}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          <p className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5 leading-relaxed">
                            {getPreview(note.content) || "Empty note"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {note.source === "supabase" ? (
                              <IconCloud size={12} className="text-[var(--color-info)] flex-shrink-0" />
                            ) : (
                              <IconDeviceDesktop size={12} className="text-[var(--color-warning)] flex-shrink-0" />
                            )}
                            <p className="text-[12px] text-[var(--color-text-tertiary)]">
                              {relativeTime(note.updatedAt)}
                            </p>
                          </div>
                          {noteTagMap[note.id]?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {noteTagMap[note.id].slice(0, 3).map((tagId) => {
                                const tag = tags.find((t) => t.id === tagId);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tagId}
                                    className="px-1.5 py-px text-[11px] rounded-full"
                                    style={{
                                      backgroundColor: tag.color + "20",
                                      color: tag.color,
                                    }}
                                  >
                                    {tag.name}
                                  </span>
                                );
                              })}
                              {noteTagMap[note.id].length > 3 && (
                                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                                  +{noteTagMap[note.id].length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Actions menu */}
                        {!selectMode && (
                          <div className="flex-shrink-0 opacity-100 md:opacity-0 md:group-hover/note:opacity-100 transition-opacity">
                            <Dropdown
                              trigger={
                                <button className="p-2 md:p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors" aria-label="Note actions">
                                  <IconDots size={16} />
                                </button>
                              }
                              placement="bottom-end"
                            >
                              {isAuthenticated && notebooks.length > 0 && (
                                <>
                                  <DropdownLabel>Move to</DropdownLabel>
                                  <NotebookMoveMenu
                                    notebooks={notebooks}
                                    currentNotebookId={note.notebookId}
                                    onMove={(notebookId) => onMoveNote?.(note.id, notebookId)}
                                  />
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

          {/* Writing session indicator */}
          {isAuthenticated && !selectMode && (
            <div className="px-3 py-1.5 border-t border-[var(--color-border-secondary)]">
              <WritingSessionIndicator />
            </div>
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
            </>
            )}

            {/* ===== NOTEBOOKS VIEW ===== */}
            {railView === "notebooks" && isAuthenticated && (
              <NotebookNavList
                onNewNotebook={handleNewNotebook}
                onEditNotebook={handleEditNotebook}
                onDeleteNotebook={handleDeleteNotebookFromSwitcher}
                onSelected={() => setRailView("notes")}
              />
            )}

            {/* ===== TAGS VIEW ===== */}
            {railView === "tags" && isAuthenticated && (
              <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
                <div className="text-[11px] text-[var(--color-text-tertiary)] mb-2">Filter notes by tag</div>
                <TagFilter />
              </div>
            )}

            {/* ===== FILTER SHEET ===== */}
            <div
              className={`absolute inset-0 z-30 ${filterSheetOpen ? "" : "pointer-events-none"}`}
              aria-hidden={!filterSheetOpen}
            >
              <div
                className={`absolute inset-0 bg-[var(--color-bg-overlay)] transition-opacity duration-[var(--duration-normal)] ${filterSheetOpen ? "opacity-100" : "opacity-0"}`}
                onClick={() => setFilterSheetOpen(false)}
              />
              <div
                className={`absolute left-0 right-0 bottom-0 bg-[var(--color-bg-elevated)] border-t border-[var(--color-border-primary)] rounded-t-[var(--radius-xl)] shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-slow)] flex flex-col ${filterSheetOpen ? "translate-y-0" : "translate-y-full"}`}
                style={{ transitionTimingFunction: "var(--ease-spring)", maxHeight: "88%" }}
              >
                <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-[var(--color-border-primary)]" />
                <div className="flex items-center justify-between px-4 py-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Filter &amp; sort</h3>
                  <div className="flex items-center gap-3">
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] flex items-center gap-1"
                      >
                        <IconFilterOff size={12} /> Clear
                      </button>
                    )}
                    <button
                      onClick={() => setFilterSheetOpen(false)}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                      aria-label="Close filters"
                    >
                      <IconX size={18} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto scrollbar-thin px-4 pb-5 pt-1 space-y-4">
                  {/* Sort */}
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Sort</div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["manual", "Manual"],
                        ["edited", "Last edited"],
                        ["created", "Created"],
                        ["title", "Title A–Z"],
                        ["notebook", "Notebook"],
                      ] as const).map(([val, label]) => (
                        <FilterButton key={val} active={sortBy === val} onClick={() => setSortBy(val as any)}>
                          {label}
                        </FilterButton>
                      ))}
                    </div>
                  </div>
                  {/* Source */}
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Source</div>
                    <div className="flex flex-wrap gap-2">
                      <FilterButton active={filterSource === "all"} onClick={() => setFilterSource("all")}>All</FilterButton>
                      <FilterButton active={filterSource === "local"} onClick={() => setFilterSource("local")}>
                        <IconDeviceDesktop size={14} />Local
                      </FilterButton>
                      {isAuthenticated && (
                        <FilterButton active={filterSource === "cloud"} onClick={() => setFilterSource("cloud")}>
                          <IconCloud size={14} />Cloud
                        </FilterButton>
                      )}
                    </div>
                  </div>
                  {/* Pinned */}
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Pinned</div>
                    <div className="flex flex-wrap gap-2">
                      <FilterButton active={filterPinned === "all"} onClick={() => setFilterPinned("all")}>All</FilterButton>
                      <FilterButton active={filterPinned === "pinned"} onClick={() => setFilterPinned("pinned")}>
                        <IconPinFilled size={14} />Pinned
                      </FilterButton>
                      <FilterButton active={filterPinned === "unpinned"} onClick={() => setFilterPinned("unpinned")}>
                        <IconPin size={14} />Unpinned
                      </FilterButton>
                    </div>
                  </div>
                  {/* Tags */}
                  {isAuthenticated && tags.length > 0 && (
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Tags</div>
                      <TagFilter />
                    </div>
                  )}
                  {/* Bulk actions */}
                  {isAuthenticated && (
                    <div className="pt-1">
                      <button
                        onClick={() => { handleToggleSelectMode(); setFilterSheetOpen(false); }}
                        className={`flex items-center gap-2 px-3 py-2 text-xs rounded-[var(--radius-md)] transition-colors ${
                          selectMode
                            ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                            : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)]"
                        }`}
                      >
                        <IconCheckbox size={14} />
                        {selectMode ? "Exit bulk actions" : "Bulk actions"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Notebook Modal */}
      <NotebookModal
        isOpen={isNotebookModalOpen}
        onClose={handleCloseNotebookModal}
        notebook={editingNotebook}
        notebooks={notebooks}
        parentIsHidden={
          editingNotebook?.parentId
            ? notebooks.find((nb) => nb.id === editingNotebook.parentId)?.isHidden ?? false
            : false
        }
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

// Rail navigation button
function RailButton({
  children,
  label,
  active,
  accent,
  badge,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] ${
        active
          ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
          : accent
            ? "text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {children}
      {badge && badge > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-semibold rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)]">
          {badge}
        </span>
      ) : null}
    </button>
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
