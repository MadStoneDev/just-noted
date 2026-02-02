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
import { createClient } from "@/utils/supabase/client";
import NotebookSwitcher from "@/components/notebook-switcher";
import NotebookModal from "@/components/notebook-modal";
import { NotebookCoverHeader } from "@/components/notebook-breadcrumb";
import BulkActionBar from "@/components/bulk-action-bar";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
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
    recalculateNotebookCounts,
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

  // Helper to upload cover using client-side Supabase (like avatars)
  const uploadCoverFile = async (notebookId: string, file: File): Promise<string | null> => {
    try {
      const supabase = createClient();

      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error("Auth error:", authError);
        return null;
      }
      if (!user) {
        console.error("User not authenticated");
        return null;
      }

      const userId = user.id;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${userId}/${notebookId}-${Date.now()}.${ext}`;

      console.log("Uploading cover to:", filePath, "File size:", file.size, "Type:", file.type);

      // Delete any existing cover for this notebook first
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("notebook-covers")
        .list(userId, { search: notebookId });

      if (listError) {
        console.error("Error listing existing files:", listError);
        // Continue with upload even if list fails
      }

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map((f) => `${userId}/${f.name}`);
        console.log("Deleting existing files:", filesToDelete);
        const { error: deleteError } = await supabase.storage.from("notebook-covers").remove(filesToDelete);
        if (deleteError) {
          console.error("Error deleting existing files:", deleteError);
          // Continue with upload even if delete fails
        }
      }

      // Upload the new file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("notebook-covers")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        console.error("Upload error details:", JSON.stringify(uploadError, null, 2));
        return null;
      }

      console.log("Upload successful:", uploadData);

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from("notebook-covers")
        .getPublicUrl(filePath);

      console.log("Public URL:", publicUrl);

      return publicUrl;
    } catch (error) {
      console.error("Upload error:", error);
      return null;
    }
  };

  const handleSaveNotebook = useCallback(async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
  }) => {
    if (editingNotebook) {
      // Update existing notebook
      let finalCoverType = data.coverType;
      let finalCoverValue = data.coverValue;

      // If there's a pending file, upload it first
      if (data.pendingFile) {
        console.log("Uploading pending file for existing notebook:", editingNotebook.id);
        const uploadedUrl = await uploadCoverFile(editingNotebook.id, data.pendingFile);
        if (uploadedUrl) {
          finalCoverType = "custom";
          finalCoverValue = uploadedUrl;
          console.log("Upload successful, cover URL:", uploadedUrl);
        } else {
          console.error("Failed to upload cover file");
          throw new Error("Failed to upload cover image. Please try again.");
        }
      }

      const result = await updateNotebook(editingNotebook.id, {
        name: data.name,
        coverType: finalCoverType,
        coverValue: finalCoverValue,
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
          console.log("Uploading pending file for new notebook:", result.notebook.id);
          const uploadedUrl = await uploadCoverFile(result.notebook.id, data.pendingFile);
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
              console.log("Notebook updated with custom cover:", uploadedUrl);
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
                onEditNotebook={handleEditNotebook}
                onDeleteNotebook={handleDeleteNotebookFromSwitcher}
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
                                    style={getCoverPreviewStyle(
                                      notebook.coverType,
                                      notebook.coverValue
                                    )}
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
        onClose={handleCloseNotebookModal}
        notebook={editingNotebook}
        onSave={handleSaveNotebook}
        onDelete={editingNotebook ? handleDeleteNotebook : undefined}
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
