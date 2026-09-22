"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sanitizeHtml } from "@/utils/sanitize";
import { marked } from "marked";
import { IconX, IconLock, IconEye, IconShare } from "@tabler/icons-react";
import { sharingOperation } from "@/app/actions/sharing";
import { createClient } from "@/utils/supabase/client";
import MilkdownEditor from "@/components/editor/milkdown-editor";
import type { ContentFormat } from "@/types/combined-notes";
import { usePresence, colorForUser } from "@/hooks/use-presence";
import { PresenceStack } from "@/components/presence-stack";

interface SharedNoteInlineProps {
  shortcode: string;
  onClose: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Viewer for a shared note, rendered inside JustNoted's main area. Read-only by
 * default. When the link grants "Can edit" and the visitor is signed in, it
 * becomes an editable surface that autosaves back to the owner's note (edits are
 * enforced server-side). Realtime presence/carets are a later surface.
 */
export default function SharedNoteInline({ shortcode, onClose }: SharedNoteInlineProps) {
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

  const supabase = createClient();
  const canEdit = !!note?.canEdit;
  const presence = usePresence(note?.id ?? null);

  const renderContent = (c: string, format?: string): string => {
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(c.trim());
    if (format === "html" && looksLikeHtml) return sanitizeHtml(c);
    const html = marked.parse(c, { async: false, gfm: true, breaks: false }) as string;
    return sanitizeHtml(html);
  };

  const fetchNote = async (pw?: string | null) => {
    setLoading(true);
    let username: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: a } = await supabase
          .from("authors")
          .select("username")
          .eq("id", userData.user.id)
          .single();
        username = (a as any)?.username ?? null;
        setMe({ name: username || "Someone", color: colorForUser(userData.user.id) });
      }
      const result = (await sharingOperation({
        operation: "getByShortcode",
        shortcode,
        currentUsername: username,
        password: pw || null,
      })) as any;

      if (result.success && result.note) {
        setNote(result.note);
        setTitle(result.note.title || "");
        setContent(result.note.content || "");
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

  const isAnonymous = note.shareInfo?.isAnonymous;
  const saveLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "";

  // ===== Editable (Can edit) =====
  if (canEdit) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Collab banner (minimal — presence/carets arrive with surface 05) */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-8 min-h-[44px] py-1.5 flex-none bg-[var(--color-accent-tint)] border-b border-[var(--color-accent-tint-border)]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 min-w-0 text-[13px] text-[var(--color-accent-text)]">
              <IconShare size={14} className="shrink-0" />
              <span className="truncate">
                {isAnonymous ? "Shared note" : <>Shared by <strong className="font-semibold">@{note.authorUsername}</strong></>} · you can edit
              </span>
            </span>
            <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-accent-deep)] leading-tight">
              owner keeps control of access
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <PresenceStack users={presence} />
            {saveLabel && (
              <span className={`text-[11px] font-[family-name:var(--font-meta)] ${saveStatus === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-accent-text)]"}`}>
                {saveLabel}
              </span>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)] transition-colors"
              title="Close"
            >
              <IconX size={16} />
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <article className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-8">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, content); }}
              placeholder="Untitled"
              className="w-full mb-4 bg-transparent text-2xl md:text-3xl font-bold text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:outline-none"
            />
            <MilkdownEditor
              content={note.content || ""}
              contentFormat={(note.content_format as ContentFormat) || "markdown"}
              onChange={(markdown) => { setContent(markdown); scheduleSave(title, markdown); }}
              collab={me ? { roomKey: note.id, user: me } : undefined}
            />
          </article>
        </div>
      </div>
    );
  }

  // ===== Read-only =====
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {readOnlyHeader}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <article className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-ink-1)] mb-2">{note.title}</h1>
          <div className="flex items-center gap-3 text-[11px] text-[var(--color-ink-5)] mb-8">
            {!isAnonymous && (
              <span className="flex items-center gap-1.5">
                {note.authorAvatar ? (
                  <img src={note.authorAvatar} alt={note.authorUsername} className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 bg-[var(--color-raised-soft)] rounded-full flex items-center justify-center text-[8px] font-medium text-[var(--color-ink-4)]">
                    {note.authorUsername?.charAt(0).toUpperCase()}
                  </div>
                )}
                {note.authorUsername}
              </span>
            )}
            {!isAnonymous && <span>·</span>}
            <span>{formatDate(note.updated_at)}</span>
          </div>
          <div className="milkdown" dangerouslySetInnerHTML={{ __html: renderContent(note.content, note.content_format) }} />
        </article>
      </div>
    </div>
  );
}
