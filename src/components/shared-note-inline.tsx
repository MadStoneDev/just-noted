"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { IconX, IconLock, IconEye, IconShare } from "@tabler/icons-react";
import {
  sharingOperation,
  setSharedNotePinned,
  setSharedNoteHidden,
  unsaveSharedNote,
} from "@/app/actions/sharing";
import { fetchCollabState } from "@/lib/collab-client";
import { createClient } from "@/utils/supabase/client";
import type { ContentFormat } from "@/types/combined-notes";
import { usePresence, colorForUser } from "@/hooks/use-presence";
import { SharedHistoryPanel } from "@/components/shared-history-panel";
import { saveCollabDoc } from "@/app/actions/collabActions";
import { decideEditorChange } from "@/utils/editor-save-decision";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import NoteView from "@/components/note-view/note-view";
import type { NoteViewModel, NoteCaps, NoteOps } from "@/components/note-view/types";

interface SharedNoteInlineProps {
  shortcode: string;
  onClose: () => void;
  /** Toggle split view (compare beside one of the viewer's own notes). */
  onToggleSplit?: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Viewer for a shared note, rendered inside JustNoted's main area. Read-only by
 * default. When the link grants "Can edit" and the visitor is signed in, it
 * becomes an editable surface that autosaves back to the owner's note (edits are
 * enforced server-side). Chrome is the shared <NoteView> (phase 1 of the merge);
 * this component owns the fetch, access gating, presence, collab and autosave.
 */
export default function SharedNoteInline({ shortcode, onClose, onToggleSplit }: SharedNoteInlineProps) {
  const [note, setNote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit state (only used when the note is editable).
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [me, setMe] = useState<{ name: string; color: string } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  // Opening a note must never save (see shared-note-page for the full rationale):
  // Milkdown's load re-serialisation / Yjs seed emits once through onChange
  // before anyone types, and saving it would rewrite the owner's note and spawn
  // a conflicted copy on their side. Adopt that first emission as the baseline.
  const lastSavedContentRef = useRef("");
  const awaitingLoadEmission = useRef(false);
  const editorMountedAt = useRef(0);
  const handleEditorReady = useCallback(() => {
    editorMountedAt.current = Date.now();
    awaitingLoadEmission.current = (lastSavedContentRef.current ?? "").trim().length > 0;
  }, []);
  // Wide window because the collab load emission is async; only ever armed for a
  // note that loaded with content, so it can't swallow a real keystroke.
  const LOAD_EMISSION_WINDOW_MS = 8000;

  const supabase = createClient();
  const canEdit = !!note?.canEdit;
  const presence = usePresence(note?.id ?? null);
  const [showHistory, setShowHistory] = useState(false);
  // Per-recipient org state for the open note (pin/hide), kept locally so the
  // overflow labels update on click. Initialized from note.recipientOrg on load.
  const [recipPinned, setRecipPinned] = useState(false);
  const [recipHidden, setRecipHidden] = useState(false);
  const toast = useToast();
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/n/${shortcode}` : "";
  const copyLink = () => { navigator.clipboard.writeText(shareLink); toast.showSuccess("Link copied"); };

  const fetchNote = async (pw?: string | null) => {
    setLoading(true);

    // Resolve the viewer's identity (for presence name + colour) in parallel
    // with the note fetch. The note fetch doesn't depend on it — the server
    // derives the viewer server-side and ignores any client-supplied username —
    // so there's no reason to make the note wait behind two extra round-trips.
    void (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;
        const { data: a } = await supabase
          .from("authors")
          .select("username")
          .eq("id", userData.user.id)
          .single();
        const username = (a as any)?.username ?? null;
        setMe({ name: username || "Someone", color: colorForUser(userData.user.id) });
      } catch {}
    })();

    try {
      const result = (await sharingOperation({
        operation: "getByShortcode",
        shortcode,
        currentUsername: null,
        password: pw || null,
      })) as any;

      if (result.success && result.note) {
        setNote(result.note);
        setTitle(result.note.title || "");
        setContent(result.note.content || "");
        const ro = (result.note as any).recipientOrg;
        setRecipPinned(!!ro?.pinned);
        setRecipHidden(!!ro?.hidden);
        lastSavedContentRef.current = result.note.content || "";
        dirtyRef.current = false;
        setSaveStatus("idle");
        setRequiresPassword(false);
        setError(null);
      } else if (result.requiresPassword) {
        setRequiresPassword(true);
        if (pw) setPwError("Incorrect password");
        setError(null);
      } else {
        setError(result.error || "Failed to load note");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNote(null);
    setError(null);
    setRequiresPassword(false);
    setPassword("");
    setPwError(null);
    fetchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcode]);

  // Debounced autosave for editable shared notes.
  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      if (!canEdit) return;
      dirtyRef.current = true;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const { data: userData } = await supabase.auth.getUser();
        const result = (await sharingOperation({
          operation: "saveSharedNote",
          shortcode,
          title: nextTitle,
          content: nextContent,
          contentFormat: "markdown",
          currentUserId: userData?.user?.id || "",
        })) as any;
        if (result.success) {
          dirtyRef.current = false;
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      }, 900);
    },
    [canEdit, shortcode, supabase],
  );

  // Flush a pending save when leaving.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleEditorChange = useCallback(
    (markdown: string) => {
      const decision = decideEditorChange({
        value: markdown,
        baseline: lastSavedContentRef.current,
        awaitingLoadEmission: awaitingLoadEmission.current,
        msSinceMount: Date.now() - editorMountedAt.current,
        windowMs: LOAD_EMISSION_WINDOW_MS,
      });
      awaitingLoadEmission.current = false;
      setContent(markdown);
      if (decision.adoptBaseline) {
        // Opening the note, not editing it — never save.
        lastSavedContentRef.current = markdown;
        return;
      }
      if (decision.persist) scheduleSave(title, markdown);
    },
    [scheduleSave, title],
  );

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setPwError(null);
    await fetchNote(password);
    setSubmitting(false);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });

  const readOnlyHeader = (
    <div className="flex items-center justify-between px-4 md:px-8 h-12 flex-none border-b border-[var(--color-hairline)]">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-ink-5)]">
        <IconEye size={13} />
        Read-only · shared note
      </span>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)] transition-colors"
        title="Close"
      >
        <IconX size={16} />
        Close
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {readOnlyHeader}
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-ink-4)]">Loading…</div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {readOnlyHeader}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xs w-full text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-raised-soft)] mb-4">
              <IconLock size={22} className="text-[var(--color-ink-4)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-ink-1)] mb-1">Password required</h2>
            <p className="text-sm text-[var(--color-ink-4)] mb-6">This note is password protected.</p>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--color-raised)] border border-[var(--color-hairline)] rounded-[var(--radius-8)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:border-[var(--color-accent-tint-border)] focus:outline-none"
                autoFocus
              />
              {pwError && <p className="text-xs text-[var(--color-danger)]">{pwError}</p>}
              <button
                type="submit"
                disabled={submitting || !password}
                className="w-full h-10 text-sm font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] rounded-[var(--radius-8)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Checking…" : "View note"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {readOnlyHeader}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xs w-full text-center">
            <h2 className="text-lg font-semibold text-[var(--color-ink-1)] mb-2">
              {error === "This shared link has expired" ? "Link expired" : "Can't access note"}
            </h2>
            <p className="text-sm text-[var(--color-ink-4)]">{error || "The requested note could not be found."}</p>
          </div>
        </div>
      </div>
    );
  }

  const isAnonymous = !!note.shareInfo?.isAnonymous;

  const model: NoteViewModel = {
    id: note.id,
    title,
    content: note.content || "",
    contentFormat: (note.content_format as ContentFormat) || "markdown",
    goal: note.goal,
    goalType: note.goal_type,
    updatedAt: note.updated_at,
    authorUsername: note.authorUsername,
    authorAvatar: note.authorAvatar,
    isAnonymous,
  };

  const ownerLabel = isAnonymous ? (
    "Shared note"
  ) : (
    <>Shared by <strong className="font-semibold">@{note.authorUsername}</strong></>
  );

  // Per-recipient actions for the overflow menu — present only when this viewer
  // is a recipient (granted reader row, or saved-by-link). Null for the owner /
  // anonymous / public-not-saved, so no recipient items show.
  const recipOrg = note.recipientOrg as
    | { source: "granted" | "saved"; pinned: boolean; hidden: boolean }
    | null
    | undefined;
  const recipientActions: NoteOps["recipientActions"] = recipOrg
    ? {
        source: recipOrg.source,
        pinned: recipPinned,
        hidden: recipHidden,
        onTogglePin: () => {
          const next = !recipPinned;
          setRecipPinned(next);
          void setSharedNotePinned(shortcode, recipOrg.source, next);
        },
        onToggleHide:
          recipOrg.source === "granted"
            ? () => {
                const next = !recipHidden;
                setRecipHidden(next);
                void setSharedNoteHidden(shortcode, next);
              }
            : undefined,
        onRemove:
          recipOrg.source === "saved"
            ? async () => {
                await unsaveSharedNote(shortcode);
                onClose();
              }
            : undefined,
      }
    : undefined;

  // ===== Editable (Can edit) =====
  if (canEdit) {
    const caps: NoteCaps = {
      isShared: true,
      isOwner: false,
      canEditContent: true,
      canShare: false,
      canPin: false,
      canOpenFile: false,
      canMoveNotebook: false,
      canMoveSource: false,
      canDelete: false,
      hasVersions: true,
      hasChat: true,
      showGoalPicker: false,
      showPagePicker: false,
    };
    const ops: NoteOps = {
      onEditorReady: handleEditorReady,
      onClose,
      onCopyLink: copyLink,
      onHistory: () => setShowHistory(true),
      onToggleSplit,
      recipientActions,
      collab: me
        ? {
            roomKey: note.id,
            user: me,
            load: () => fetchCollabState({ shortcode }),
            save: (state) => saveCollabDoc({ shortcode, state }).then(() => {}),
          }
        : undefined,
    };
    const saveLabel =
      saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "";

    return (
      <NoteView
        model={model}
        caps={caps}
        ops={ops}
        title={title}
        onTitleChange={(v) => { setTitle(v); scheduleSave(v, content); }}
        content={content}
        onContentChange={handleEditorChange}
        contextLabel={
          <>
            <IconShare size={14} className="shrink-0" />
            <span className="truncate">{ownerLabel} · you can edit</span>
          </>
        }
        contextSubLabel="owner keeps control of access"
        statusLabel={saveLabel}
        statusTone={saveStatus === "error" ? "error" : "normal"}
        presence={presence}
        shareLink={shareLink}
        collabPending={!me}
        overlay={showHistory ? <SharedHistoryPanel shortcode={shortcode} onClose={() => setShowHistory(false)} /> : undefined}
      />
    );
  }

  // ===== Read-only =====
  const caps: NoteCaps = {
    isShared: true,
    isOwner: false,
    canEditContent: false,
    canShare: false,
    canPin: false,
    canOpenFile: false,
    canMoveNotebook: false,
    canMoveSource: false,
    canDelete: false,
    hasVersions: true,
    hasChat: false,
    showGoalPicker: false,
    showPagePicker: false,
  };
  const ops: NoteOps = { onClose, onCopyLink: copyLink, onHistory: () => setShowHistory(true), onToggleSplit, recipientActions };

  return (
    <NoteView
      model={model}
      caps={caps}
      ops={ops}
      title={title}
      content={content}
      overlay={showHistory ? <SharedHistoryPanel shortcode={shortcode} onClose={() => setShowHistory(false)} /> : undefined}
      contextLabel={
        <>
          <IconEye size={13} className="shrink-0" />
          <span className="truncate">{ownerLabel} · read-only</span>
        </>
      }
      shareLink={shareLink}
      byline={
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-ink-5)] mb-2">
          {!isAnonymous && (
            <span className="flex items-center gap-1.5">
              <Avatar url={note.authorAvatar} name={note.authorUsername} size={16} />
              {note.authorUsername}
            </span>
          )}
          {!isAnonymous && <span>·</span>}
          <span>{formatDate(note.updated_at)}</span>
        </div>
      }
      notice={
        note.editBlockedByOwnerPlan ? (
          <div className="mb-6 flex items-center gap-2 px-3 py-2 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] text-[12px] text-[var(--color-ink-4)]">
            <IconLock size={13} className="shrink-0" />
            The owner’s plan doesn’t include shared editing.
          </div>
        ) : undefined
      }
    />
  );
}
