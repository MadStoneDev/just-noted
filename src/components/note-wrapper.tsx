"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import ActiveNoteEditor from "@/components/active-note-editor";
import { MobileTabBar, MobileEditorNav, MobileFab, type MobileTab } from "@/components/mobile-chrome";
import { MobileAccountDrawer } from "@/components/mobile-account-drawer";
import HelpModal from "@/components/help-modal";
import SearchModal from "@/components/search-modal";
import TrashView from "@/components/trash-view";
import NotebookBreadcrumb from "@/components/notebook-breadcrumb";
import SharedNoteInline from "@/components/shared-note-inline";
import NotebooksGrid from "@/components/notebooks-grid";
import NotebookView from "@/components/notebook-view";
import SettingsView from "@/components/settings-view";
import AccountDeletionGate from "@/components/account-deletion-gate";
import AdminView from "@/components/admin-view";
import { readEditorFont, applyEditorFont, readEditorFontSize, applyEditorFontSize } from "@/utils/editor-font";
import { captureCurrentAccount } from "@/utils/accounts";
import { createClient } from "@/utils/supabase/client";
import NotebookModal from "@/components/notebook-modal";
import UndoDeleteToast from "@/components/ui/undo-toast";
import OfflineIndicator from "@/components/ui/offline-indicator";
import { updateNotebook, deleteNotebook } from "@/app/actions/notebookActions";
import { uploadNotebookCover } from "@/utils/storage/cover-upload";
import { CoverType } from "@/types/notebook";

import { CombinedNote } from "@/types/combined-notes";
import { NotesErrorBoundary } from "@/components/error-boundary";
import { useNotesSync } from "@/hooks/use-notes-sync";
import { useNotesOperations } from "@/hooks/use-notes-operations";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useNotesStore } from "@/stores/notes-store";
import { SkipLinks } from "@/hooks/use-accessibility";

export default function NoteWrapper({ mainSlot }: { mainSlot?: React.ReactNode }) {
  const {
    userId,
    isAuthenticated,
    refreshNotes,
    registerNoteFlush,
    unregisterNoteFlush,
    noteFlushFunctions,
  } = useNotesSync();

  const notesOperations = useNotesOperations(
    userId,
    isAuthenticated,
    refreshNotes,
    noteFlushFunctions,
  );

  const sidebarOpen = useNotesStore((s) => s.sidebarOpen);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const setSidebarOpen = useNotesStore((s) => s.setSidebarOpen);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const notes = useNotesStore((s) => s.notes);
  const updateNotebookInStore = useNotesStore((s) => s.updateNotebook);
  const removeNotebook = useNotesStore((s) => s.removeNotebook);
  const recalculateNotebookCounts = useNotesStore((s) => s.recalculateNotebookCounts);

  const activeNotebook = useNotesStore((state) => {
    const { activeNotebookId, notebooks } = state;
    if (!activeNotebookId || activeNotebookId === "loose") return null;
    return notebooks.find((n) => n.id === activeNotebookId) || null;
  });

  // Notebook modal
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  // Read-only shared note open in the main area (by shortcode)
  const [sharedShortcode, setSharedShortcode] = useState<string | null>(null);
  // Notebooks cover grid (Level 1, /notebooks) open in the main area
  const [showNotebooksGrid, setShowNotebooksGrid] = useState(false);
  // Single notebook view (Level 2, /notebooks/:id) — the id, or null.
  const [notebookViewId, setNotebookViewId] = useState<string | null>(null);
  // Public routed views (Pricing, Roadmap, the-how, the-what, Tools) are
  // SERVER-rendered and arrive via `mainSlot`; NoteWrapper just renders the slot
  // on those routes (see publicRouted below) — no per-view client state.
  // Admin dashboard (role >= 10), opened from the rail.
  const [showAdmin, setShowAdmin] = useState(false);
  // Mobile "You" account drawer (bottom sheet).
  const [showAccountDrawer, setShowAccountDrawer] = useState(false);
  // In-shell settings view open in the main area
  const [showSettings, setShowSettings] = useState(false);
  // Deep-link target section for Settings (e.g. from an upgrade upsell).
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  // Which bottom-tab is highlighted on mobile (design surface 08).
  const [mobileTab, setMobileTab] = useState<MobileTab>("notes");

  // Route-driven views: /roadmap, /settings, /admin each have their own URL, and
  // NoteWrapper lives in the (app) layout so it persists across them. The URL is
  // the source of truth — sync the view state from the path so a refresh or a
  // shared link lands on the right place (no more lost state).
  const pathname = usePathname();
  const router = useRouter();
  // Public routed views whose content is server-rendered and passed in via
  // `mainSlot`. NoteWrapper renders the slot for these (no notes sidebar).
  const publicRouted =
    pathname === "/roadmap" ||
    pathname === "/pricing" ||
    pathname === "/the-how" ||
    pathname === "/the-what" ||
    pathname === "/tools" ||
    pathname.startsWith("/tools/");
  useEffect(() => {
    const isSettings = pathname === "/settings";
    const isAdmin = pathname === "/admin";
    const isNotebooks = pathname === "/notebooks";
    const nbViewMatch = pathname.match(/^\/notebooks\/([^/]+)$/);
    const nbViewId = nbViewMatch ? decodeURIComponent(nbViewMatch[1]) : null;
    const sharedMatch = pathname.match(/^\/n\/([^/]+)$/);
    setShowSettings(isSettings);
    setShowAdmin(isAdmin);
    // Notebooks grid (Level 1) and notebook view (Level 2) are URL-driven and
    // never co-render — exactly one is set from the path.
    setShowNotebooksGrid(isNotebooks);
    setNotebookViewId(nbViewId);
    setSettingsSection(
      isSettings
        ? new URLSearchParams(window.location.search).get("section") ?? undefined
        : undefined,
    );
    if (isSettings || isAdmin || publicRouted) {
      setShowTrash(false);
      setSharedShortcode(null);
      setSidebarOpen(false);
      setShowAccountDrawer(false);
    } else if (isNotebooks || nbViewId) {
      // Notebooks keep the sidebar OPEN — it shows the notebook tree (spec §3)
      // alongside the grid (Level 1) or notebook view (Level 2) in the main area.
      setShowTrash(false);
      setSharedShortcode(null);
      setShowAccountDrawer(false);
      setSidebarOpen(true);
    } else if (sharedMatch) {
      // A public shared-note link (/n/<shortcode>) — open it in the shell (rail
      // + sidebar + the note in the main area), not the old standalone page.
      setShowTrash(false);
      setShowAccountDrawer(false);
      setSharedShortcode(decodeURIComponent(sharedMatch[1]));
      setSidebarOpen(true);
    } else {
      setSidebarOpen(true);
    }
    // Tab-bar highlight (spec §2.3). Signed-in users reach Tools via the You
    // tab, so You is active on /tools/*. Other public routes aren't in the tab
    // bar, so nothing highlights ("none").
    const isTools = pathname === "/tools" || pathname.startsWith("/tools/");
    if (isSettings) setMobileTab("settings");
    else if (isNotebooks || nbViewId) setMobileTab("notebooks");
    else if (isTools) setMobileTab("you");
    else if (publicRouted) setMobileTab("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Apply the saved editor font + size once on load.
  useEffect(() => {
    applyEditorFont(readEditorFont());
    applyEditorFontSize(readEditorFontSize());
  }, []);

  // Remember whether the main area last showed a shared note, and restore it on
  // reload. activeNoteId / justnoted_last_note only cover the user's own notes,
  // so without this a refresh drops a shared note back to the last own-note.
  const sharedRestoredRef = useRef(false);
  useEffect(() => {
    try {
      const sc = localStorage.getItem("justnoted_last_shared");
      if (sc) setSharedShortcode(sc);
    } catch {}
    sharedRestoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!sharedRestoredRef.current) return; // don't clobber before the restore runs
    try {
      if (sharedShortcode) localStorage.setItem("justnoted_last_shared", sharedShortcode);
      else localStorage.removeItem("justnoted_last_shared");
    } catch {}
  }, [sharedShortcode]);

  // Record the current account (fresh tokens) into the device store so it's
  // listed in the account switcher and switchable later. Re-capture on token
  // refresh so the active account's stored session never goes stale (Supabase
  // rotates refresh tokens).
  useEffect(() => {
    const supabase = createClient();
    captureCurrentAccount(supabase).catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        captureCurrentAccount(supabase).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cross-component triggers from the rail.
  useEffect(() => {
    const openGrid = () => router.push("/notebooks");
    // Settings replaces the notes sidebar (its own section list stands in for it).
    // An optional string detail deep-links to a section (e.g. "Plan & usage").
    // These now navigate — NoteWrapper's URL effect drives the view. Dispatchers
    // (rail buttons, upgrade upsells) are unchanged; they just route now.
    // Routed views toggle: tapping the rail/nav button for the view you're
    // already on navigates back to the notes app ("/"). A deep-linked Settings
    // section (detail string, e.g. from an upgrade upsell) always opens, never
    // toggles off. window.location.pathname is read at call time so these
    // once-registered handlers don't capture a stale path.
    const openSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string" && detail) {
        router.push(`/settings?section=${encodeURIComponent(detail)}`);
        return;
      }
      router.push(window.location.pathname === "/settings" ? "/" : "/settings");
    };
    const openSearch = () => setShowSearch(true);
    // Help opens the in-app Help modal (listens for the same event, which toggles).
    const openHelp = () => {};
    const openRoadmap = () =>
      router.push(window.location.pathname === "/roadmap" ? "/" : "/roadmap");
    const openTools = () =>
      router.push(window.location.pathname.startsWith("/tools") ? "/" : "/tools");
    const openAdmin = () =>
      router.push(window.location.pathname === "/admin" ? "/" : "/admin");
    window.addEventListener("justnoted:open-notebooks-grid", openGrid);
    window.addEventListener("justnoted:open-settings", openSettings);
    window.addEventListener("justnoted:open-search", openSearch);
    window.addEventListener("justnoted:open-help", openHelp);
    window.addEventListener("justnoted:open-roadmap", openRoadmap);
    window.addEventListener("justnoted:open-tools", openTools);
    window.addEventListener("justnoted:open-admin", openAdmin);
    return () => {
      window.removeEventListener("justnoted:open-notebooks-grid", openGrid);
      window.removeEventListener("justnoted:open-settings", openSettings);
      window.removeEventListener("justnoted:open-search", openSearch);
      window.removeEventListener("justnoted:open-help", openHelp);
      window.removeEventListener("justnoted:open-roadmap", openRoadmap);
      window.removeEventListener("justnoted:open-tools", openTools);
      window.removeEventListener("justnoted:open-admin", openAdmin);
    };
  }, []);

  const handleForceSave = useCallback(() => {
    noteFlushFunctions.current.forEach((flushFn) => {
      try { flushFn(); } catch {}
    });
  }, [noteFlushFunctions]);

  // ===== Mobile bottom-tab navigation (design surface 08) =====
  const goNotes = useCallback(() => {
    // Toggle: tapping Notes while its list is already open collapses the sidebar
    // to reveal the note behind it.
    if (mobileTab === "notes" && useNotesStore.getState().sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    router.push("/");
    setShowAccountDrawer(false);
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setSharedShortcode(null);
    useNotesStore.getState().setActiveNotebookId(null);
    window.dispatchEvent(new Event("justnoted:show-notes"));
    setSidebarOpen(true);
    setMobileTab("notes");
  }, [setSidebarOpen, router, mobileTab]);

  const goNotebooks = useCallback(() => {
    // Toggle: tapping Notebooks while already in the notebooks area returns to
    // notes; otherwise open the grid (Level 1).
    if (window.location.pathname.startsWith("/notebooks")) {
      router.push("/");
      setMobileTab("notes");
      return;
    }
    setShowAccountDrawer(false);
    router.push("/notebooks");
    setMobileTab("notebooks");
  }, [router]);

  const goShared = useCallback(() => {
    // Toggle: tapping Shared while its list is already open collapses the sidebar.
    if (mobileTab === "shared" && useNotesStore.getState().sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    router.push("/");
    setShowAccountDrawer(false);
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setSharedShortcode(null);
    window.dispatchEvent(new Event("justnoted:show-shared"));
    setSidebarOpen(true);
    setMobileTab("shared");
  }, [setSidebarOpen, router, mobileTab]);

  // "You": logged in → account drawer (switch / add / log out / help);
  // logged out → sign in. It no longer jumps to Settings.
  const goYou = useCallback(() => {
    if (isAuthenticated) {
      setShowAccountDrawer(true);
    } else {
      router.push("/get-access");
    }
    setMobileTab("you");
  }, [isAuthenticated, router]);

  const goSettings = useCallback(() => {
    // Toggle: tapping Settings while already on it returns to notes.
    if (pathname === "/settings") {
      router.push("/");
      setMobileTab("notes");
      return;
    }
    router.push("/settings");
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setSharedShortcode(null);
    setMobileTab("settings");
  }, [router, pathname]);

  const mobileNewNote = useCallback(() => {
    notesOperations.addNote();
    setSidebarOpen(false);
    setMobileTab("notes");
  }, [notesOperations, setSidebarOpen]);

  // Phase 0 — flush pending edits when the tab is hidden or closed.
  // visibilitychange→hidden is the signal browsers reliably deliver before a
  // tab is discarded (and while the page is still alive, so async saves can
  // complete); pagehide is the backup for bfcache/navigation. beforeunload
  // alone is not dependable for saving.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleForceSave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", handleForceSave);
    // Explicit flush request (e.g. just before logout, while still authenticated).
    window.addEventListener("justnoted:flush", handleForceSave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", handleForceSave);
      window.removeEventListener("justnoted:flush", handleForceSave);
    };
  }, [handleForceSave]);


  const handleSaveNotebook = useCallback(async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
  }) => {
    if (!activeNotebook) return;

    let finalCoverType = data.coverType;
    let finalCoverValue = data.coverValue;

    if (data.pendingFile) {
      const uploadedUrl = await uploadNotebookCover(activeNotebook.id, data.pendingFile);
      if (uploadedUrl) {
        finalCoverType = "custom";
        finalCoverValue = uploadedUrl;
      } else {
        throw new Error("Failed to upload cover image.");
      }
    }

    const result = await updateNotebook(activeNotebook.id, {
      name: data.name,
      coverType: finalCoverType,
      coverValue: finalCoverValue,
    });

    if (result.success && result.notebook) {
      updateNotebookInStore(activeNotebook.id, result.notebook);
    } else {
      throw new Error(result.error || "Failed to update notebook");
    }
  }, [activeNotebook, updateNotebookInStore]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!activeNotebook) return;
    const result = await deleteNotebook(activeNotebook.id);
    if (result.success) {
      removeNotebook(activeNotebook.id);
      recalculateNotebookCounts();
    } else {
      throw new Error(result.error || "Failed to delete notebook");
    }
  }, [activeNotebook, removeNotebook, recalculateNotebookCounts]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewNote: notesOperations.addNote,
    onSave: handleForceSave,
    onToggleSplitView: undefined,
    onSearch: () => setShowSearch(true),
    // Escape closes the top open main-area layer first; the hook then handles
    // the sidebar on the next press. Order = visual stacking, most-recent first.
    onEscape: () => {
      if (pathname.startsWith("/tools/")) { router.push("/tools"); return true; } // a tool → tools grid
      if (publicRouted || showAdmin || showSettings) { router.push("/"); return true; }
      if (notebookViewId) { router.push("/notebooks"); return true; } // Level 2 → Level 1
      if (showNotebooksGrid) { router.push("/"); return true; }       // Level 1 → notes
      if (showTrash) { setShowTrash(false); setSidebarOpen(true); return true; }
      if (sharedShortcode) { setSharedShortcode(null); setSidebarOpen(true); return true; }
      return false;
    },
  });

  return (
    <NotesErrorBoundary>
      <AccountDeletionGate />
      <SkipLinks notes={!publicRouted} />

      {/* Shell: on desktop the rail owns navigation; on mobile a bottom tab bar
          (design surface 08) sits below the rail+sidebar+editor row. */}
      <div className="flex flex-col h-dvh overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (its own icon rail owns primary navigation) */}
        <Sidebar
          onNoteClick={() => setSharedShortcode(null)}
          onBulkDelete={(noteIds) => {
            noteIds.forEach((id) => notesOperations.deleteNote(id));
          }}
          onDeleteNote={(noteId) => notesOperations.deleteNote(noteId)}
          onMoveNote={(noteId, notebookId) => {
            const { optimisticUpdateNote, recalculateNotebookCounts } = useNotesStore.getState();
            optimisticUpdateNote(noteId, { notebookId });
            recalculateNotebookCounts();
            import("@/app/actions/notebookActions").then(({ bulkAssignNotesToNotebook }) => {
              bulkAssignNotesToNotebook([noteId], notebookId);
            });
          }}
          onOpenTrash={() => setShowTrash(true)}
          onNewNote={() => notesOperations.addNote()}
          onTogglePin={(noteId, isPinned) => notesOperations.updatePinStatus(noteId, isPinned)}
          onTransferNote={(noteId, targetSource) => notesOperations.transferNote(noteId, targetSource)}
          onOpenShared={(shortcode) => {
            setSharedShortcode(shortcode);
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              setSidebarOpen(false);
            }
          }}
        />

        {/* Main area: the editor, or a read-only shared note when one is open. */}
        <main
          id="main-content"
          className="flex-1 flex flex-col min-w-0 bg-[var(--color-canvas)]"
          role="main"
          aria-label={sharedShortcode ? "Shared note" : "Note editor"}
        >
          {publicRouted ? (
            // Server-rendered public view (Pricing / Roadmap / the-how / the-what
            // / Tools) passed in from the marker page — content is in the first
            // HTML response for SEO.
            mainSlot
          ) : showAdmin ? (
            <AdminView onClose={() => router.push("/")} />
          ) : showSettings ? (
            <SettingsView
              initialSection={settingsSection}
              onClose={() => router.push("/")}
            />
          ) : showTrash ? (
            <TrashView onClose={() => setShowTrash(false)} />
          ) : notebookViewId ? (
            <NotebookView
              notebookId={notebookViewId}
              onNavigateNotebook={(id) => router.push(id ? `/notebooks/${id}` : "/notebooks")}
              onOpenNotes={(id) => {
                const s = useNotesStore.getState();
                s.setActiveNotebookId(id);
                window.dispatchEvent(new Event("justnoted:show-notes"));
                router.push("/");
              }}
              onEdit={(id) =>
                window.dispatchEvent(new CustomEvent("justnoted:edit-notebook", { detail: id }))
              }
            />
          ) : showNotebooksGrid ? (
            <NotebooksGrid
              onClose={() => router.push("/")}
              onOpenNotebookView={(id) => router.push(`/notebooks/${id}`)}
              onNewNotebook={() =>
                window.dispatchEvent(new Event("justnoted:new-notebook"))
              }
              onDropNote={(noteId, notebookId) => {
                const s = useNotesStore.getState();
                s.optimisticUpdateNote(noteId, { notebookId });
                s.recalculateNotebookCounts();
                import("@/app/actions/notebookActions").then(({ bulkAssignNotesToNotebook }) => {
                  bulkAssignNotesToNotebook([noteId], notebookId);
                });
              }}
            />
          ) : sharedShortcode ? (
            <SharedNoteInline
              shortcode={sharedShortcode}
              onClose={() => {
                setSharedShortcode(null);
                if (pathname.startsWith("/n/")) router.replace("/");
              }}
            />
          ) : (
            <>
              {/* Mobile editor nav (design surface 08) — desktop uses its own toolbar. */}
              <MobileEditorNav
                onBack={() => { setSidebarOpen(true); setMobileTab("notes"); }}
                onShare={() => window.dispatchEvent(new Event("justnoted:open-share"))}
                onMore={() => window.dispatchEvent(new Event("justnoted:open-note-actions"))}
              />
              <ActiveNoteEditor
                userId={userId || ""}
                isAuthenticated={isAuthenticated}
                notesOperations={notesOperations}
                registerNoteFlush={registerNoteFlush}
                unregisterNoteFlush={unregisterNoteFlush}
              />
            </>
          )}
        </main>
      </div>

        {/* Mobile bottom tab bar (design surface 08). */}
        <MobileTabBar
          active={mobileTab}
          onNotes={goNotes}
          onNotebooks={goNotebooks}
          onShared={goShared}
          onSettings={goSettings}
          onYou={goYou}
        />
      </div>

      <MobileAccountDrawer open={showAccountDrawer} onClose={() => setShowAccountDrawer(false)} />

      {/* Mobile FAB — new note, shown on the notes list only (not the Shared
          list, where a new note makes no sense and it covers the rows). */}
      {sidebarOpen && mobileTab !== "shared" && !publicRouted && !showAdmin && !showSettings && !showTrash && !showNotebooksGrid && !notebookViewId && !sharedShortcode && (
        <MobileFab onClick={mobileNewNote} />
      )}

      {/* Split view */}

      <UndoDeleteToast />
      <OfflineIndicator />
      <HelpModal />
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />

      <NotebookModal
        isOpen={showNotebookModal}
        onClose={() => setShowNotebookModal(false)}
        notebook={activeNotebook}
        onSave={handleSaveNotebook}
        onDelete={handleDeleteNotebook}
      />
    </NotesErrorBoundary>
  );
}
