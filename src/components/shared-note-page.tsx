"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { sanitizeHtml } from "@/utils/sanitize";
import { marked } from "marked";
import {
  IconArrowLeft,
  IconLock,
  IconPrinter,
  IconUser,
  IconShare,
} from "@tabler/icons-react";

import { sharingOperation } from "@/app/actions/sharing";
import { createClient } from "@/utils/supabase/client";
import MilkdownEditor from "@/components/editor/milkdown-editor";
import type { ContentFormat } from "@/types/combined-notes";
import { usePresence, colorForUser } from "@/hooks/use-presence";
import { PresenceStack } from "@/components/presence-stack";
import { SharedHistoryPanel } from "@/components/shared-history-panel";
import { loadCollabDoc, saveCollabDoc } from "@/app/actions/collabActions";
import NoteStatsRow from "@/components/note-stats-row";
import AutoGrowTitle from "@/components/auto-grow-title";
import { Dropdown, DropdownItem } from "@/components/ds/dropdown";
import { useToast } from "@/components/ui/toast";
import { IconHistory, IconLink, IconDots } from "@tabler/icons-react";

interface SharedNote {
  id: string;
  title: string;
  content: string;
  content_format?: "html" | "markdown";
  goal?: number | null;
  goal_type?: string | null;
  author: string;
  authorUsername: string;
  authorAvatar: string | null;
  created_at: string;
  updated_at: string;
  is_private?: boolean;
  canEdit?: boolean;
  shareInfo?: {
    isAnonymous?: boolean;
    linkPermission?: string;
    canEdit?: boolean;
  };
}

interface SharedNotePageProps {
  shortcode?: string;
}

export default function SharedNotePage({
  shortcode: propShortcode,
}: SharedNotePageProps) {
  const params = useParams();
  const shortcode = propShortcode || (params?.shortcode as string);

  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Edit state (used only when the link grants "Can edit").
  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [me, setMe] = useState<{ name: string; color: string } | null>(null);
  const contentRef = useRef("");
  const saveTimer = useRef<number | null>(null);

  const supabase = createClient();
  const canEdit = !!note?.canEdit;
  const presence = usePresence(note?.id ?? null);
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/n/${shortcode}` : "";
  const copyLink = () => { navigator.clipboard.writeText(shareLink); toast.showSuccess("Link copied"); };

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
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
        setSaveStatus(result.success ? "saved" : "error");
      }, 900);
    },
    [shortcode, supabase],
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const renderContent = (content: string): string => {
    // Always parse as Markdown. Marked passes real HTML (block and inline)
    // through untouched, so genuinely-HTML legacy notes still render, while
    // Markdown notes render correctly even when a note's content_format flag is
    // a stale "html" (which happened because saves didn't rewrite the flag).
    // We no longer trust that flag for rendering.
    const html = marked.parse(content, { async: false, gfm: true, breaks: false }) as string;
    return sanitizeHtml(html);
  };

  const fetchNote = async (pw?: string | null) => {
    let username = null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: authorData } = await supabase
          .from("authors")
          .select("username")
          .eq("id", userData.user.id)
          .single();
        if (authorData?.username) {
          username = authorData.username;
          setCurrentUsername(username);
        }
        setMe({ name: username || "Someone", color: colorForUser(userData.user.id) });
      }

      const result = await sharingOperation({
        operation: "getByShortcode",
        shortcode,
        currentUsername: username,
        password: pw || null,
      }) as any;

      if (result.success && result.note) {
        setNote(result.note as SharedNote);
        setTitle(result.note.title || "");
        contentRef.current = result.note.content || "";
        setSaveStatus("idle");
        setRequiresPassword(false);
        setError(null);
      } else if (result.requiresPassword) {
        setRequiresPassword(true);
        if (pw) setPasswordError("Incorrect password");
        setError(null);
      } else {
        setError(result.error || "Failed to load note");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (shortcode) {
      fetchNote();
    } else {
      setError("No shortcode provided");
      setIsLoading(false);
    }
  }, [shortcode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPassword(true);
    setPasswordError(null);
    await fetchNote(password);
    setSubmittingPassword(false);
  };

  const handlePrint = () => window.print();

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
          <svg className="animate-spin h-4 w-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  // Password required
  if (requiresPassword) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-xs w-full text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] mb-4">
            <IconLock size={22} className="text-[var(--color-text-tertiary)]" />
          </div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
            Password required
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            This note is password protected.
          </p>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-accent-subtle)] focus:outline-none"
              autoFocus
            />
            {passwordError && (
              <p className="text-xs text-[var(--color-danger)]">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={submittingPassword || !password}
              className="w-full h-10 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
            >
              {submittingPassword ? "Checking..." : "View note"}
            </button>
          </form>
          <Link
            href="/"
            className="inline-flex items-center gap-1 mt-4 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <IconArrowLeft size={12} />
            Back to JustNoted
          </Link>
        </div>
      </div>
    );
  }

  // Error
  if (error || !note) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-xs w-full text-center">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            {error === "This shared link has expired" ? "Link expired" : "Can't access note"}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {error || "The requested note could not be found."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <IconArrowLeft size={14} />
            Back to JustNoted
          </Link>
        </div>
      </div>
    );
  }

  const isAnonymous = note.shareInfo?.isAnonymous;

  // ===== Editable (Can edit) =====
  if (canEdit) {
    const saveLabel =
      saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "";
    return (
      <main className="flex-grow pt-14">
        <div className="max-w-[var(--content-width)] mx-auto mt-3 px-4 md:px-8">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 min-h-[44px] rounded-[var(--radius-9)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)]">
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
            <div className="flex items-center gap-1.5 shrink-0">
              <PresenceStack users={presence} />
              {saveLabel && (
                <span className={`text-[11px] font-[family-name:var(--font-meta)] mr-1 ${saveStatus === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-accent-text)]"}`}>
                  {saveLabel}
                </span>
              )}
              <button onClick={() => setShowHistory(true)} title="Version history"
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)] transition-colors">
                <IconHistory size={16} />
              </button>
              <button onClick={copyLink} title="Copy link"
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)] transition-colors">
                <IconLink size={16} />
              </button>
              <Dropdown
                placement="bottom-end"
                trigger={
                  <button title="More" className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)] transition-colors">
                    <IconDots size={16} />
                  </button>
                }
              >
                <DropdownItem onClick={copyLink}>Copy link</DropdownItem>
                <DropdownItem onClick={() => window.open(shareLink, "_blank")}>Open in new tab</DropdownItem>
              </Dropdown>
            </div>
          </div>
          {showHistory && <SharedHistoryPanel shortcode={shortcode} onClose={() => setShowHistory(false)} />}
        </div>
        <article className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-8">
          <AutoGrowTitle
            value={title}
            onChange={(v) => { setTitle(v); scheduleSave(v, contentRef.current); }}
            className="mb-1"
          />
          <div className="mb-6">
            <NoteStatsRow content={note.content} goal={note.goal} goalType={note.goal_type} />
          </div>
          <MilkdownEditor
            content={note.content || ""}
            contentFormat={(note.content_format as ContentFormat) || "markdown"}
            onChange={(markdown) => { contentRef.current = markdown; scheduleSave(title, markdown); }}
            collab={me ? {
              roomKey: note.id,
              user: me,
              load: () => loadCollabDoc({ shortcode }).then((r) => r.state),
              save: (state) => saveCollabDoc({ shortcode, state }).then(() => {}),
            } : undefined}
          />
        </article>
      </main>
    );
  }

  // Note view
  return (
    <main className="flex-grow pt-14 print:block print:pt-0">
      {/* Top bar */}
      <div className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-3 flex items-center justify-between print:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <IconArrowLeft size={14} />
          Back
        </Link>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <IconPrinter size={14} />
          Print
        </button>
      </div>

      {/* Note content */}
      <article className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 pb-16">
        {/* Title */}
        <h1 className="font-[family-name:var(--font-editor)] text-[32px] md:text-[46px] leading-[1.1] font-medium tracking-[-0.015em] text-[var(--color-ink)] mb-2">
          {note.title || "Untitled"}
        </h1>

        {/* Meta + stats */}
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] mb-2">
          {!isAnonymous && (
            <span className="flex items-center gap-1.5">
              {note.authorAvatar ? (
                <img
                  src={note.authorAvatar}
                  alt={note.authorUsername}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <div className="w-4 h-4 bg-[var(--color-bg-tertiary)] rounded-full flex items-center justify-center text-[8px] font-medium text-[var(--color-text-tertiary)]">
                  {note.authorUsername.charAt(0).toUpperCase()}
                </div>
              )}
              {note.authorUsername}
            </span>
          )}
          {!isAnonymous && <span>·</span>}
          <span>{formatDate(note.updated_at)}</span>
        </div>

        {/* Stats (read-only) */}
        <div className="mb-8">
          <NoteStatsRow content={note.content} goal={note.goal} goalType={note.goal_type} />
        </div>

        {/* Content */}
        <div
          className="milkdown"
          dangerouslySetInnerHTML={{
            __html: renderContent(note.content),
          }}
        />
      </article>

      {/* Footer */}
      <div className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-4 border-t border-[var(--color-border-secondary)] print:hidden">
        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
          {currentUsername ? (
            <span className="flex items-center gap-1">
              <IconUser size={11} />
              Viewing as {currentUsername}
            </span>
          ) : (
            <span />
          )}
          <span>Shared via JustNoted</span>
        </div>
      </div>
    </main>
  );
}
