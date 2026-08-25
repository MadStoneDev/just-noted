"use client";

import { useEffect, useState } from "react";
import { sanitizeHtml } from "@/utils/sanitize";
import { marked } from "marked";
import { IconX, IconLock, IconEye } from "@tabler/icons-react";
import { sharingOperation } from "@/app/actions/sharing";
import { createClient } from "@/utils/supabase/client";

interface SharedNoteInlineProps {
  shortcode: string;
  onClose: () => void;
}

/**
 * Read-only viewer for a shared note, rendered inside JustNoted's main area
 * (same place the editor sits). Intentionally has NO owner controls — no edit,
 * delete, move, share, or add-to-folder — because these notes aren't owned by
 * the viewer.
 */
export default function SharedNoteInline({ shortcode, onClose }: SharedNoteInlineProps) {
  const [note, setNote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  const renderContent = (content: string, format?: string): string => {
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content.trim());
    if (format === "html" && looksLikeHtml) return sanitizeHtml(content);
    const html = marked.parse(content, { async: false, gfm: true, breaks: false }) as string;
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
      }
      const result = (await sharingOperation({
        operation: "getByShortcode",
        shortcode,
        currentUsername: username,
        password: pw || null,
      })) as any;

      if (result.success && result.note) {
        setNote(result.note);
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setPwError(null);
    await fetchNote(password);
    setSubmitting(false);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });

  const header = (
    <div className="flex items-center justify-between px-4 md:px-8 h-12 flex-none border-b border-[var(--color-border-secondary)]">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">
        <IconEye size={13} />
        Read-only · shared note
      </span>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
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
        {header}
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
          Loading…
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {header}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xs w-full text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] mb-4">
              <IconLock size={22} className="text-[var(--color-text-tertiary)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Password required</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">This note is password protected.</p>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-accent-subtle)] focus:outline-none"
                autoFocus
              />
              {pwError && <p className="text-xs text-[var(--color-danger)]">{pwError}</p>}
              <button
                type="submit"
                disabled={submitting || !password}
                className="w-full h-10 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
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
        {header}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-xs w-full text-center">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {error === "This shared link has expired" ? "Link expired" : "Can't access note"}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {error || "The requested note could not be found."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isAnonymous = note.shareInfo?.isAnonymous;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {header}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <article className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] mb-2">{note.title}</h1>
          <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] mb-8">
            {!isAnonymous && (
              <span className="flex items-center gap-1.5">
                {note.authorAvatar ? (
                  <img src={note.authorAvatar} alt={note.authorUsername} className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 bg-[var(--color-bg-tertiary)] rounded-full flex items-center justify-center text-[8px] font-medium text-[var(--color-text-tertiary)]">
                    {note.authorUsername?.charAt(0).toUpperCase()}
                  </div>
                )}
                {note.authorUsername}
              </span>
            )}
            {!isAnonymous && <span>·</span>}
            <span>{formatDate(note.updated_at)}</span>
          </div>
          <div
            className="milkdown"
            dangerouslySetInnerHTML={{ __html: renderContent(note.content, note.content_format) }}
          />
        </article>
      </div>
    </div>
  );
}
