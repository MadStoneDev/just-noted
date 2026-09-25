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
import SharedNavList from "@/components/shared-nav-list";
import NotebookModal from "@/components/notebook-modal";
import TagFilter from "@/components/tag-filter";
import WritingSessionIndicator from "@/components/writing-session-indicator";
import { getTags, bulkGetNoteTags } from "@/app/actions/tagActions";
import BulkActionBar from "@/components/bulk-action-bar";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { getPlainTextPreview as getPlainTextPreviewUtil } from "@/utils/html-utils";
import NotebookMoveMenu from "@/components/notebook-move-menu";
import AccountMenu from "@/components/account-menu";
import { SwipeableRow } from "@/components/mobile-chrome";
import {
  IconX,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconCloud,
  IconFilterOff,
  IconLayoutGrid,
  IconCheckbox,
  IconSquare,
  IconSquareCheck,
  IconDeviceDesktop,
  IconDots,
  IconTrash,
  IconNotebook,
  IconGripVertical,
  IconPlus,
  IconChevronDown,
  IconAdjustmentsHorizontal,
  IconLogin2,
  IconHelp,
  IconLayoutKanban,
  IconNote,
  IconTag,
  IconShare,
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
  onOpenShared?: (shortcode: string) => void;
  onTogglePin?: (noteId: string, isPinned: boolean) => void;
}

const SORT_LABELS: Record<"manual" | "edited" | "created" | "title" | "notebook", string> = {
  manual: "Manual",
  edited: "Last edited",
  created: "Created",
  title: "Title A–Z",
  notebook: "Notebook",
};
const SOURCE_LABELS: Record<"all" | "cloud" | "local", string> = {
  all: "All sources",
  cloud: "Cloud",
  local: "Local",
};

const RAIL_VIEW_KEY = "jn_sidebar_rail_view";
const RAIL_VIEWS = ["notes", "notebooks", "tags", "shared"] as const;

export default function Sidebar({ onNoteClick, onBulkDelete, onDeleteNote, onMoveNote, onOpenTrash, onNewNote, onOpenShared, onTogglePin }: SidebarProps) {
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
  // Mobile: note being moved via swipe-right → shows a notebook picker sheet.
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);

  // Rail navigation: which panel the content column shows. Defaults to "notes";
  // the last-open view is restored from localStorage on mount (see effects below).
  const [railView, setRailView] = useState<"notes" | "notebooks" | "tags" | "shared">("notes");
  // Filters live in a slide-up sheet, out of the list's way
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Restore the last-open rail view on mount (in an effect, not the useState
  // initialiser, to avoid a hydration mismatch — server always renders "notes").
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RAIL_VIEW_KEY);
      if (stored && (RAIL_VIEWS as readonly string[]).includes(stored)) {
        setRailView(stored as (typeof RAIL_VIEWS)[number]);
      }
    } catch {
      // localStorage unavailable — keep the default.
    }
  }, []);

  // Persist the rail view whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_VIEW_KEY, railView);
    } catch {
      // localStorage unavailable — ignore.
    }
  }, [railView]);

  // Opening a notebook from the grid switches the sidebar back to the notes list.
  useEffect(() => {
    const showNotes = () => setRailView("notes");
    const showShared = () => setRailView("shared");
    window.addEventListener("justnoted:show-notes", showNotes);
    window.addEventListener("justnoted:show-shared", showShared);
    return () => {
      window.removeEventListener("justnoted:show-notes", showNotes);
      window.removeEventListener("justnoted:show-shared", showShared);
    };
  }, []);

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

  // Ancestor chain [topmost … current] for the breadcrumb, when a real notebook
  // (not All / Loose) is selected.
  const notebookChain: Notebook[] = (() => {
    if (!activeNotebookId || activeNotebookId === "loose") return [];
    const byId = new Map(notebooks.map((nb) => [nb.id, nb]));
    const chain: Notebook[] = [];
    let id: string | null | undefined = activeNotebookId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const nb = byId.get(id);
      if (!nb) break;
      chain.unshift(nb);
      id = nb.parentId;
    }
    return chain;
  })();
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
      if (e.key !== "Escape") return;
      // Close the filter sheet first if it's open, otherwise the sidebar —
      // the sheet is a fixed overlay and would otherwise orphan on screen.
      if (filterSheetOpen) {
        setFilterSheetOpen(false);
      } else if (sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, setSidebarOpen, filterSheetOpen]);

  // Never leave the fixed filter sheet on screen after the sidebar closes.
  useEffect(() => {
    if (!sidebarOpen) setFilterSheetOpen(false);
  }, [sidebarOpen]);


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
          noteElement.classList.add("ring-2", "ring-[var(--color-accent-text)]", "ring-offset-2");
          setTimeout(() => {
            noteElement.classList.remove("ring-2", "ring-[var(--color-accent-text)]", "ring-offset-2");
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

  // Let the notebooks grid (main area) open the create-notebook modal.
  useEffect(() => {
    window.addEventListener("justnoted:new-notebook", handleNewNotebook);
    return () => window.removeEventListener("justnoted:new-notebook", handleNewNotebook);
  }, [handleNewNotebook]);

  const handleEditNotebook = useCallback((notebook: Notebook) => {
    setEditingNotebook(notebook);
    setIsNotebookModalOpen(true);
  }, []);

  // Let the notebooks grid's detail modal open the full edit modal (cover etc.).
  useEffect(() => {
    const onEdit = (e: Event) => {
      const id = (e as CustomEvent).detail as string;
      const nb = useNotesStore.getState().notebooks.find((n) => n.id === id);
      if (nb) handleEditNotebook(nb);
    };
    window.addEventListener("justnoted:edit-notebook", onEdit);
    return () => window.removeEventListener("justnoted:edit-notebook", onEdit);
  }, [handleEditNotebook]);

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
        className={`relative left-0 h-full z-40 md:z-auto bg-[var(--color-panel)] border-r border-[var(--color-hairline)] transition-all duration-[var(--duration-slow)] overflow-hidden ${
          sidebarOpen ? "w-full md:w-[340px]" : "w-0 md:w-14"
        }`}
        style={{
          transitionTimingFunction: "var(--ease-spring)",
          flexShrink: 0,
        }}
      >
        {/* Fixed inner width so content doesn't reflow while the aside animates:
            full viewport width on mobile, 248px on desktop. */}
        <div className="flex h-full w-screen md:w-[340px]">
          {/* Permanent icon rail — desktop primary navigation. On mobile this is
              replaced by the bottom tab bar (design surface 08). */}
          <nav className="hidden md:flex w-14 flex-none flex-col items-center gap-1.5 py-3 border-r border-[var(--color-hairline)] bg-[var(--color-panel)]">
            {/* Logo */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-7)] text-[12px] font-bold mb-1.5"
              style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-accent-on-fill)" }}
              aria-hidden
            >
              JN
            </div>
            {isAuthenticated && (
              <RailButton
                label="Notes"
                active={railView === "notes"}
                onClick={() => { setActiveNotebookId(null); setRailView("notes"); setSidebarOpen(true); }}
              >
                <IconNote size={20} />
              </RailButton>
            )}
            {isAuthenticated && (
              <RailButton
                label="Notebooks"
                active={railView === "notebooks"}
                onClick={() => { setRailView("notebooks"); setSidebarOpen(true); }}
              >
                <IconNotebook size={20} />
              </RailButton>
            )}
            {isAuthenticated && (
              <RailButton
                label="Shared"
                active={railView === "shared"}
                onClick={() => { setRailView("shared"); setSidebarOpen(true); }}
              >
                <IconShare size={20} />
              </RailButton>
            )}
            <RailButton
              label="Search"
              onClick={() => window.dispatchEvent(new Event("justnoted:open-search"))}
            >
              <IconSearch size={20} />
            </RailButton>
            <div className="flex-1" />
            <RailButton
              label="Roadmap"
              onClick={() => window.dispatchEvent(new Event("justnoted:open-roadmap"))}
            >
              <IconLayoutKanban size={20} />
            </RailButton>
            <RailButton
              label="Help"
              onClick={() => window.dispatchEvent(new Event("justnoted:open-help"))}
            >
              <IconHelp size={20} />
            </RailButton>
            <RailButton
              label="Settings"
              onClick={() => window.dispatchEvent(new Event("justnoted:open-settings"))}
            >
              <IconAdjustmentsHorizontal size={20} />
            </RailButton>
            <RailButton label="New note" accent onClick={onNewNote}>
              <IconPlus size={20} />
            </RailButton>
            {/* Account switcher (design surface 12), or a log-in entry point
                in the same slot when signed out. */}
            {isAuthenticated ? (
              <div className="mt-1.5">
                <AccountMenu />
              </div>
            ) : (
              <a
                href="/get-access"
                aria-label="Log in"
                title="Log in"
                className="mt-1.5 w-[26px] h-[26px] rounded-full flex items-center justify-center bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
              >
                <IconLogin2 size={15} />
              </a>
            )}
          </nav>

          {/* Content column */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* View header */}
            <div className="flex items-center justify-between px-3 h-[52px] flex-none border-b border-[var(--color-hairline-soft)]">
              {railView === "notes" && notebookChain.length > 0 ? (
                <nav className="flex items-center gap-1 min-w-0 text-sm font-semibold" aria-label="Breadcrumb">
                  {notebookChain.length < 3 ? (
                    <>
                      <button
                        onClick={() => setActiveNotebookId(null)}
                        className="shrink-0 text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors"
                      >
                        All
                      </button>
                      {notebookChain.map((nb, i) => (
                        <React.Fragment key={nb.id}>
                          <span className="shrink-0 text-[var(--color-ink-6)]">›</span>
                          {i === notebookChain.length - 1 ? (
                            <span className="min-w-0 truncate text-[var(--color-ink-1)]">{nb.name}</span>
                          ) : (
                            <button
                              onClick={() => setActiveNotebookId(nb.id)}
                              className="min-w-0 truncate text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors"
                            >
                              {nb.name}
                            </button>
                          )}
                        </React.Fragment>
                      ))}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setActiveNotebookId(notebookChain[notebookChain.length - 2].id)}
                        title="Up one level"
                        className="shrink-0 text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors"
                      >
                        …
                      </button>
                      <span className="shrink-0 text-[var(--color-ink-6)]">›</span>
                      <span className="min-w-0 truncate text-[var(--color-ink-1)]">
                        {notebookChain[notebookChain.length - 1].name}
                      </span>
                    </>
                  )}
                </nav>
              ) : (
                <h2 className="text-[22px] md:text-sm font-semibold text-[var(--color-ink-1)] tracking-tight truncate">
                  {railView === "notebooks"
                    ? "Notebooks"
                    : railView === "tags"
                      ? "Tags"
                      : railView === "shared"
                        ? "Shared"
                        : viewContextName}
                </h2>
              )}
              {railView === "notes" && hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)] flex items-center gap-1 transition-colors flex-none"
                >
                  <IconFilterOff size={12} />
                  Clear
                </button>
              )}
              {railView === "notebooks" && (
                <button
                  onClick={() => window.dispatchEvent(new Event("justnoted:open-notebooks-grid"))}
                  title="Browse as grid"
                  aria-label="Browse notebooks as grid"
                  className="flex items-center gap-1 text-[11px] text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors flex-none"
                >
                  <IconLayoutGrid size={14} />
                  Grid
                </button>
              )}
            </div>

            {/* ===== NOTES VIEW ===== */}
            {railView === "notes" && (
            <>
          {/* Search */}
          <div className="px-3 py-3 border-b border-[var(--color-hairline-soft)]">
            <div className="relative">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-5)]"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes..."
                value={localSearchQuery}
                onChange={handleSearchChange}
                className="w-full pl-9 pr-9 py-3 md:py-2 text-base md:text-sm bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent-fill)] focus:bg-[var(--color-raised)] focus:outline-none transition-all duration-[var(--duration-fast)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
              />
              {localSearchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-5)] hover:text-[var(--color-ink-3)]"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
            {/* Three inline controls: sort · source · filter (design). On mobile
                the row scrolls horizontally with 44px targets. */}
            <div className="mt-2 flex items-center gap-1.5 flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible">
              <Dropdown
                placement="bottom-start"
                trigger={
                  <button className="shrink-0 flex items-center gap-1 px-3 h-11 md:px-2 md:h-7 rounded-[var(--radius-6)] text-[12px] border border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors">
                    {SORT_LABELS[sortBy]}
                    <IconChevronDown size={12} className="opacity-60" />
                  </button>
                }
              >
                {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((v) => (
                  <DropdownItem key={v} onClick={() => setSortBy(v)}>{SORT_LABELS[v]}</DropdownItem>
                ))}
              </Dropdown>

              <Dropdown
                placement="bottom-start"
                trigger={
                  <button
                    className={`shrink-0 flex items-center gap-1 px-3 h-11 md:px-2 md:h-7 rounded-[var(--radius-6)] text-[12px] border transition-colors ${
                      filterSource !== "all"
                        ? "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                        : "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
                    }`}
                  >
                    {SOURCE_LABELS[filterSource]}
                    <IconChevronDown size={12} className="opacity-60" />
                  </button>
                }
              >
                {(Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[]).map((v) => (
                  <DropdownItem key={v} onClick={() => setFilterSource(v)}>{SOURCE_LABELS[v]}</DropdownItem>
                ))}
              </Dropdown>

              <button
                onClick={() => setFilterSheetOpen(true)}
                className={`shrink-0 flex items-center gap-1 px-3 h-11 md:px-2 md:h-7 rounded-[var(--radius-6)] text-[12px] border transition-colors ${
                  filterPinned !== "all" || activeNotebookId !== null || filterTagIds.length > 0
                    ? "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                    : "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
                }`}
              >
                <IconAdjustmentsHorizontal size={13} />
                Filter
                {(filterPinned !== "all" ? 1 : 0) + (filterTagIds.length > 0 ? 1 : 0) > 0 && (
                  <span className="ml-0.5">· {(filterPinned !== "all" ? 1 : 0) + (filterTagIds.length > 0 ? 1 : 0)}</span>
                )}
              </button>
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredNotes.length === 0 ? (
              <div className="px-4 py-10 text-center">
                {hasActiveFilters ? (
                  <>
                    <h3 className="font-[family-name:var(--font-editor)] text-[19px] font-medium text-[var(--color-ink)]">
                      {searchQuery ? `No notes match “${searchQuery}”` : "No notes match your filters"}
                    </h3>
                    <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--color-ink-4)]">
                      {(() => {
                        const total = notes.filter((n) => !n.deletedAt).length;
                        return `Clearing filters shows ${total} note${total !== 1 ? "s" : ""}.`;
                      })()}
                    </p>
                    <button
                      onClick={clearFilters}
                      className="mt-3 h-7 px-3 rounded-[var(--radius-7)] text-[12px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="font-[family-name:var(--font-editor)] text-[19px] font-medium text-[var(--color-ink)]">
                      Nothing written yet
                    </h3>
                    <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--color-ink-4)]">
                      Your notes will appear here, newest first. Press ⌘N to start one.
                    </p>
                    <button
                      onClick={onNewNote}
                      className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
                    >
                      <IconPlus size={14} stroke={2} />
                      New note
                    </button>
                  </>
                )}
              </div>
            ) : (
              <ul className="flex flex-col px-1 py-1 gap-0.5">
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
                      // Payload so cross-component drop targets (e.g. the
                      // notebooks grid) can identify the note being dragged.
                      e.dataTransfer.setData("application/x-jn-note", note.id);
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
                    className={dragOverNoteId === note.id ? "border-t border-[var(--color-accent-text)]" : ""}
                  >
                    <SwipeableRow
                      isPinned={!!note.isPinned}
                      disabled={selectMode}
                      onDelete={() => setDeleteNoteId(note.id)}
                      onPin={() => onTogglePin?.(note.id, !note.isPinned)}
                      onMove={() => setMoveNoteId(note.id)}
                      onLongPress={() => {
                        if (note.source === "supabase") {
                          setSelectMode(true);
                          setSelectedNoteIds(new Set([note.id]));
                        }
                      }}
                    >
                    <div
                      className={`group/note relative w-full px-2.5 py-3 md:px-2 md:py-2 text-left transition-colors duration-[var(--duration-fast)] rounded-[var(--radius-8)] border ${
                        draggedNoteId === note.id ? "opacity-40" : ""
                      } ${
                        isSelected || isActive
                          ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]"
                          : "border-transparent hover:bg-[var(--color-raised-soft)]"
                      }`}
                    >
                      {shortcutKey !== null && !selectMode && (
                        <span className="absolute top-1 right-1 text-[8px] font-mono text-[var(--color-ink-5)] opacity-0 group-hover/note:opacity-50 transition-opacity" title={`Ctrl+Alt+${shortcutKey}`}>
                          {shortcutKey}
                        </span>
                      )}
                      {/* Drag handle — absolute so it doesn't consume left space */}
                      {!selectMode && (
                        <div className="absolute left-0.5 top-3 cursor-grab opacity-0 group-hover/note:opacity-30 transition-opacity">
                          <IconGripVertical size={10} />
                        </div>
                      )}
                      <div className="flex items-start gap-1.5">
                        {selectMode && (
                          <div className="flex-shrink-0 pt-0.5" onClick={() => handleToggleNoteSelection(note.id)}>
                            {note.source === "supabase" ? (
                              isSelected ? (
                                <IconSquareCheck size={16} className="text-[var(--color-accent-text)]" />
                              ) : (
                                <IconSquare size={16} className="text-[var(--color-ink-5)]" />
                              )
                            ) : (
                              <IconSquare size={16} className="text-[var(--color-hairline)]" />
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
                            {note.isPinned ? (
                              <IconPinFilled size={13} className="mt-[3px] text-[var(--color-accent-text)] flex-shrink-0" />
                            ) : (
                              <IconNote size={13} className="mt-[3px] text-[var(--color-ink-5)] flex-shrink-0" />
                            )}
                            <h3 className="flex-1 min-w-0 text-[16px] md:text-[13px] font-medium text-[var(--color-ink-1)] leading-snug whitespace-normal break-words">
                              {note.title}
                            </h3>
                          </div>
                          {note.notebookId && (() => {
                            const notebook = notebooks.find((nb) => nb.id === note.notebookId);
                            if (notebook) {
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveNotebookId(notebook.id);
                                    setRailView("notes");
                                  }}
                                  title={`Go to ${notebook.name}`}
                                  className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-px text-[11px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)] truncate max-w-[150px] transition-colors"
                                >
                                  <IconNotebook size={10} className="shrink-0" />
                                  {notebook.name}
                                </button>
                              );
                            }
                            return null;
                          })()}
                          <p className="text-[13.5px] md:text-[11px] text-[var(--color-ink-5)] truncate mt-0.5 leading-relaxed">
                            {getPreview(note.content) || "Empty note"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {note.source === "supabase" ? (
                              <IconCloud size={12} className="text-[var(--color-info)] flex-shrink-0" />
                            ) : (
                              <IconDeviceDesktop size={12} className="text-[var(--color-warning)] flex-shrink-0" />
                            )}
                            <p className="text-[12px] text-[var(--color-ink-5)]">
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
                                <span className="text-[11px] text-[var(--color-ink-5)]">
                                  +{noteTagMap[note.id].length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Delete — appears on hover (desktop); swipe on mobile is the follow-up */}
                        {!selectMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteNoteId(note.id); }}
                            className="hidden md:block flex-shrink-0 p-1.5 rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-danger-strong)] hover:bg-[var(--color-raised-soft)] md:opacity-0 md:group-hover/note:opacity-100 transition-opacity"
                            aria-label="Delete note"
                            title="Delete"
                          >
                            <IconTrash size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                    </SwipeableRow>
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
            <div className="px-3 py-1.5 border-t border-[var(--color-hairline-soft)]">
              <WritingSessionIndicator />
            </div>
          )}

          {/* Footer */}
          {!selectMode && (
            <div className="px-3 py-2.5 border-t border-[var(--color-hairline-soft)] flex items-center justify-between text-[10px] text-[var(--color-ink-5)]">
              <span>
                {notes.length} note{notes.length !== 1 ? "s" : ""}
                {hasActiveFilters && ` · ${filteredNotes.length} shown`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpenTrash?.()}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-[var(--radius-6)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors"
                  title="Trash"
                >
                  <IconTrash size={12} />
                  Trash
                </button>
                <button
                  onClick={() => {
                    import("@/utils/export-notes").then(({ exportAsMarkdownZip }) => {
                      exportAsMarkdownZip(notes);
                    });
                  }}
                  className="px-2 py-1.5 rounded-[var(--radius-6)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors"
                  title="Export all notes"
                >
                  Export All
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
                <div className="text-[11px] text-[var(--color-ink-5)] mb-2">Filter notes by tag</div>
                <TagFilter />
              </div>
            )}

            {/* ===== SHARED VIEW ===== */}
            {railView === "shared" && isAuthenticated && (
              <SharedNavList onOpen={(sc) => onOpenShared?.(sc)} />
            )}

            {/* ===== FILTER SHEET (mobile) / MODAL (desktop) ===== */}
            <div
              className={`fixed inset-0 z-50 flex items-end md:items-center justify-center ${filterSheetOpen ? "" : "pointer-events-none"}`}
              aria-hidden={!filterSheetOpen}
            >
              <div
                className={`absolute inset-0 bg-[var(--color-bg-overlay)] transition-opacity duration-[var(--duration-normal)] ${filterSheetOpen ? "opacity-100" : "opacity-0"}`}
                onClick={() => setFilterSheetOpen(false)}
              />
              <div
                className={`relative w-full md:w-[440px] md:max-w-[92vw] max-h-[85vh] bg-[var(--color-raised)] border-t md:border border-[var(--color-hairline)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] transition-all duration-[var(--duration-slow)] flex flex-col ${filterSheetOpen ? "translate-y-0 opacity-100 md:scale-100" : "translate-y-full opacity-100 md:translate-y-0 md:opacity-0 md:scale-95"}`}
                style={{ transitionTimingFunction: "var(--ease-spring)" }}
              >
                <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-[var(--color-hairline)]" />
                <div className="flex items-center justify-between px-4 py-2">
                  <h3 className="text-sm font-semibold text-[var(--color-ink-1)]">Filter &amp; sort</h3>
                  <div className="flex items-center gap-3">
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)] flex items-center gap-1"
                      >
                        <IconFilterOff size={12} /> Clear
                      </button>
                    )}
                    <button
                      onClick={() => setFilterSheetOpen(false)}
                      className="text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)]"
                      aria-label="Close filters"
                    >
                      <IconX size={18} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto scrollbar-thin px-4 pb-5 pt-1 space-y-4">
                  {/* Sort */}
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)] mb-2">Sort</div>
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
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)] mb-2">Source</div>
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
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)] mb-2">Pinned</div>
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
                      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)] mb-2">Tags</div>
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
                            ? "bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]"
                            : "bg-[var(--color-raised-soft)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
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

      {/* Move-to-notebook sheet (mobile swipe-right → Move) */}
      <div
        className={`fixed inset-0 z-50 flex items-end md:items-center justify-center ${moveNoteId ? "" : "pointer-events-none"}`}
        aria-hidden={!moveNoteId}
      >
        <div
          className={`absolute inset-0 bg-[var(--color-bg-overlay)] transition-opacity duration-[var(--duration-normal)] ${moveNoteId ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMoveNoteId(null)}
        />
        <div
          className={`relative w-full md:w-[420px] md:max-w-[92vw] max-h-[80vh] bg-[var(--color-raised)] border-t md:border border-[var(--color-hairline)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] transition-all duration-[var(--duration-slow)] flex flex-col ${moveNoteId ? "translate-y-0 opacity-100 md:scale-100" : "translate-y-full opacity-100 md:translate-y-0 md:opacity-0 md:scale-95"}`}
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-[var(--color-hairline)]" />
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-semibold text-[var(--color-ink-1)]">Move to notebook</h3>
            <button
              onClick={() => setMoveNoteId(null)}
              className="text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)]"
              aria-label="Close"
            >
              <IconX size={18} />
            </button>
          </div>
          <div className="overflow-y-auto scrollbar-thin px-2 pb-5 pt-1">
            {moveNoteId && (
              <NotebookMoveMenu
                notebooks={notebooks}
                currentNotebookId={notes.find((n) => n.id === moveNoteId)?.notebookId ?? null}
                onMove={(notebookId) => {
                  onMoveNote?.(moveNoteId, notebookId);
                  setMoveNoteId(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
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
      className={`relative w-10 h-10 flex items-center justify-center rounded-[var(--radius-9)] transition-colors duration-[var(--duration-fast)] ${
        active
          ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
          : accent
            ? "bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90"
            : "text-[var(--color-ink-5)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)]"
      }`}
    >
      {/* 2×22 teal indicator on the rail's outer edge when active */}
      {active && (
        <span className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 h-[22px] w-[2px] rounded-[2px] bg-[var(--color-accent-text)]" />
      )}
      {children}
      {badge && badge > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-semibold rounded-full bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]">
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
          ? "bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]"
          : "bg-[var(--color-raised-soft)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
      }`}
    >
      {children}
    </button>
  );
}
