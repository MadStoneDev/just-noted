"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  IconX,
  IconMessageCircle,
  IconSend,
  IconPencil,
  IconTrash,
  IconLock,
  IconPaperclip,
  IconMicrophone,
  IconPlayerStopFilled,
  IconQuote,
} from "@tabler/icons-react";
import { getAnchorApi, type NoteAnchor } from "@/lib/note-anchor-bridge";
import { useNoteChat } from "@/hooks/use-note-chat";
import {
  sendChatMessage,
  editChatMessage,
  deleteOwnChatMessage,
  requestChatMediaUpload,
  sendChatMediaMessage,
  getChatMediaUrl,
} from "@/app/actions/chatActions";
import { baseMime } from "@/lib/chat-media";
import { compressImage } from "@/utils/image/compress";
import { ConfirmModal } from "@/components/ds/modal";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import type { ChatMessageView } from "@/lib/chat";

// Fetches a short-lived presigned URL for a message's media and refreshes it
// before it expires, so long-open chats never show a broken attachment.
function MediaAttachment({ messageId, kind }: { messageId: string; kind: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const r = await getChatMediaUrl(messageId);
      if (!alive) return;
      if (r.ok && r.url) {
        setUrl(r.url);
        const refreshInMs = Math.max(30, (r.expiresInSeconds ?? 600) - 30) * 1000;
        timer = setTimeout(load, refreshInMs);
      }
    };
    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [messageId]);

  if (!url) {
    return <div className="mt-1 h-16 w-40 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] animate-pulse" />;
  }
  if (kind === "audio") {
    return <audio controls src={url} className="mt-1 w-full max-w-[260px] h-9" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Attachment" className="mt-1 max-w-full max-h-72 rounded-[var(--radius-8)] object-contain" />;
}

interface NoteChatPanelProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function MessageRow({
  m,
  onEdit,
  onDelete,
  onAnchorClick,
}: {
  m: ChatMessageView;
  onEdit: (m: ChatMessageView) => void;
  onDelete: (m: ChatMessageView) => void;
  onAnchorClick: (a: NonNullable<ChatMessageView["anchor"]>) => void;
}) {
  if (m.isDeleted) {
    return (
      <li className="px-4 py-1.5 flex items-center gap-2 text-[12px] italic text-[var(--color-ink-6)]">
        <IconTrash size={12} /> Message deleted
      </li>
    );
  }
  return (
    <li className="group/msg px-4 py-2 flex gap-2.5 hover:bg-[var(--color-raised-soft)]/40">
      <Avatar name={m.authorName} url={m.authorAvatar} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-medium text-[var(--color-ink-1)] truncate">{m.authorName}</span>
          <span className="text-[10.5px] text-[var(--color-ink-6)] shrink-0">{relativeTime(m.createdAt)}</span>
          {m.isEdited && <span className="text-[10px] text-[var(--color-ink-6)] shrink-0">(edited)</span>}
        </div>
        {m.anchor && (
          <button
            onClick={() => onAnchorClick(m.anchor!)}
            title="Jump to the quoted text"
            className="mt-0.5 mb-1 w-full text-left flex gap-1.5 pl-2 border-l-2 border-[var(--color-accent-tint-border)] hover:border-[var(--color-accent-text)] transition-colors"
          >
            <IconQuote size={12} className="mt-0.5 shrink-0 text-[var(--color-ink-6)]" />
            <span className="text-[11.5px] italic text-[var(--color-ink-5)] line-clamp-2">{m.anchor.quote}</span>
          </button>
        )}
        {m.body && (
          <p className="text-[13px] text-[var(--color-ink-2)] whitespace-pre-wrap break-words leading-snug">{m.body}</p>
        )}
        {m.hasMedia && <MediaAttachment messageId={m.id} kind={m.kind} />}
      </div>
      {m.isOwn && (
        <div className="shrink-0 flex items-start gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(m)}
            aria-label="Edit message"
            className="p-1 rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised)]"
          >
            <IconPencil size={13} />
          </button>
          <button
            onClick={() => onDelete(m)}
            aria-label="Delete message"
            className="p-1 rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-danger-strong)] hover:bg-[var(--color-raised)]"
          >
            <IconTrash size={13} />
          </button>
        </div>
      )}
    </li>
  );
}

export default function NoteChatPanel({ noteId, open, onClose }: NoteChatPanelProps) {
  const { showError } = useToast();
  const { messages, canSend, loading, reload } = useNoteChat(open ? noteId : null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<ChatMessageView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessageView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<NoteAnchor | null>(null);
  // A single pending attachment held in the composer (C10/C11): the user picks
  // an image or records audio, previews it here, and it only uploads when they
  // hit send (optionally with a caption). One attachment per message.
  type MediaDraft = { blob: Blob; url: string; kind: "image" | "gif" | "audio"; mime: string };
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  // Revoke the preview object URL when the draft is replaced or the panel closes.
  useEffect(() => {
    return () => { if (draft) URL.revokeObjectURL(draft.url); };
  }, [draft]);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Auto-grow the composer textarea with its content (C12). Runs on every text
  // change — typing, submit clearing it, a quote/edit prefill — so the field
  // tracks the content up to the CSS cap (max-h-32), then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open, editing]);

  // Stage an attachment in the composer (replacing any previous one). The actual
  // upload happens on send — see uploadDraft / submit.
  const stageDraft = (blob: Blob, kind: MediaDraft["kind"], mime: string) => {
    setDraft({ blob, url: URL.createObjectURL(blob), kind, mime });
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const base = baseMime(f.type);
    if (base === "image/gif") { stageDraft(f, "gif", "image/gif"); return; }
    if (base.startsWith("image/")) {
      // Canvas re-encode strips EXIF and normalises to webp.
      const webp = await compressImage(f, { maxDim: 1600, mimeType: "image/webp" });
      stageDraft(webp, "image", "image/webp");
      return;
    }
    showError("That file type isn’t supported");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime });
        // Stage the recording for review (playback + delete) — don't auto-send.
        if (blob.size > 0) stageDraft(blob, "audio", mime);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      showError("Couldn’t access the microphone");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  // Upload the staged attachment, then post the message (optional caption). The
  // draft's object URL is revoked by the cleanup effect once `draft` is cleared.
  const uploadDraft = async (d: MediaDraft, caption: string): Promise<boolean> => {
    setUploading(true);
    try {
      const req = await requestChatMediaUpload(noteId, d.kind, d.mime, d.blob.size);
      if (!req.ok || !req.url || !req.key) {
        showError(req.error || "Couldn't start the upload");
        return false;
      }
      const put = await fetch(req.url, {
        method: "PUT",
        body: d.blob,
        headers: { "Content-Type": baseMime(d.mime) },
      });
      if (!put.ok) { showError("Upload failed"); return false; }
      const res = await sendChatMediaMessage(noteId, {
        key: req.key,
        kind: d.kind,
        mime: baseMime(d.mime),
        meta: { size: d.blob.size },
        body: caption || null,
      });
      if (!res.success) { showError(res.error || "Couldn't send the attachment"); return false; }
      return true;
    } finally {
      setUploading(false);
    }
  };

  // Keep the newest message in view as messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!editing) return;
    setText(editing.body ?? "");
    setDraft(null); // editing is text-only; drop any staged attachment
    inputRef.current?.focus();
  }, [editing]);

  const submit = async () => {
    if (sending || uploading) return;
    const value = text.trim();

    // Editing an existing message — text only.
    if (editing) {
      if (!value) return;
      setSending(true);
      try {
        const res = await editChatMessage(editing.id, value);
        if (!res.success) { showError(res.error || "Couldn't save the edit"); return; }
        setText("");
        setEditing(null);
      } finally {
        setSending(false);
      }
      return;
    }

    // A staged attachment: upload it now, with the field text as an optional
    // caption ("add text or just send").
    if (draft) {
      setSending(true);
      try {
        const ok = await uploadDraft(draft, value);
        if (!ok) return; // uploadDraft surfaced the error; keep the draft to retry
        setText("");
        setDraft(null);
        setPendingAnchor(null);
        await reload();
      } finally {
        setSending(false);
      }
      return;
    }

    // Plain text message.
    if (!value) return;
    setSending(true);
    try {
      const res = await sendChatMessage(noteId, value, pendingAnchor);
      if (!res.success) { showError(res.error || "Couldn't send the message"); return; }
      setText("");
      setPendingAnchor(null);
      await reload();
    } finally {
      setSending(false);
    }
  };

  const quoteSelection = () => {
    const a = getAnchorApi(noteId)?.capture() ?? null;
    if (a) setPendingAnchor(a);
    else showError("Select some text in the note first, then quote it.");
  };

  const goToAnchor = (a: NoteAnchor) => {
    const ok = getAnchorApi(noteId)?.scrollTo(a) ?? false;
    if (!ok) showError("The quoted text has changed or isn’t open here.");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && editing) {
      setEditing(null);
      setText("");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const res = await deleteOwnChatMessage(confirmDelete.id);
    setConfirmDelete(null);
    if (res.success) reload();
    else showError("Couldn't delete the message");
  };

  if (!open) return null;

  return (
    <>
      {/* Docked side column — sits beside the note so editing continues. Full
          width on mobile, a fixed rail on larger screens. */}
      <aside className="w-full lg:w-[340px] shrink-0 h-full min-h-0 bg-[var(--color-bg-elevated)] border-l border-[var(--color-border-secondary)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center gap-2">
            <IconMessageCircle size={16} className="text-[var(--color-text-tertiary)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Chat</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center px-6">
              <p className="text-sm text-[var(--color-text-tertiary)]">No messages yet</p>
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                Say something to the people this note is shared with.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {messages.map((m) => (
                <MessageRow key={m.id} m={m} onEdit={setEditing} onDelete={setConfirmDelete} onAnchorClick={goToAnchor} />
              ))}
            </ul>
          )}
        </div>

        {/* Composer / read-only notice */}
        {canSend ? (
          <div className="border-t border-[var(--color-border-secondary)] p-2.5">
            {editing && (
              <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] text-[var(--color-ink-5)]">
                <span>Editing message</span>
                <button onClick={() => { setEditing(null); setText(""); }} className="hover:text-[var(--color-ink-2)]">Cancel</button>
              </div>
            )}
            {pendingAnchor && !editing && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 mb-1.5 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] border-l-2 border-[var(--color-accent-text)]">
                <IconQuote size={12} className="mt-0.5 shrink-0 text-[var(--color-ink-5)]" />
                <span className="flex-1 min-w-0 text-[11.5px] italic text-[var(--color-ink-4)] line-clamp-2">{pendingAnchor.quote}</span>
                <button
                  onClick={() => setPendingAnchor(null)}
                  aria-label="Remove quote"
                  className="shrink-0 text-[var(--color-ink-5)] hover:text-[var(--color-ink-2)]"
                >
                  <IconX size={13} />
                </button>
              </div>
            )}
            {/* Staged attachment preview (C10/C11): a thumbnail for an image/GIF,
                a playable control for audio, each with a remove/delete button.
                The attachment only uploads when the message is sent. */}
            {draft && !editing && (
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded-[var(--radius-8)] bg-[var(--color-raised-soft)] border border-[var(--color-hairline)]">
                {draft.kind === "audio" ? (
                  <audio controls src={draft.url} className="h-9 flex-1 min-w-0" />
                ) : (
                  <>
                    <img
                      src={draft.url}
                      alt="Attachment preview"
                      className="h-14 w-14 rounded-[var(--radius-6)] object-cover shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-[11.5px] text-[var(--color-ink-4)] truncate">
                      {draft.kind === "gif" ? "GIF" : "Image"} ready to send
                    </span>
                  </>
                )}
                <button
                  onClick={() => setDraft(null)}
                  disabled={uploading || sending}
                  aria-label={draft.kind === "audio" ? "Delete recording" : "Remove attachment"}
                  title={draft.kind === "audio" ? "Delete recording" : "Remove attachment"}
                  className="shrink-0 p-1 rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-danger-strong)] hover:bg-[var(--color-raised)] transition-colors disabled:opacity-40"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            )}
            {/* Two-row composer (C12): the message field spans the full width and
                auto-grows; the action buttons live on their own row below it, so
                the tools never squeeze the field and don't need to collapse. */}
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={uploading || recording}
              placeholder={uploading ? "Uploading…" : recording ? "Recording…" : draft ? "Add a caption, or just send…" : "Message…"}
              className="block w-full resize-none max-h-32 overflow-y-auto px-3 py-2 text-[13px] bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent)] focus:bg-[var(--color-raised)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] disabled:opacity-60 transition-colors"
            />
            {!editing && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onPickFile}
              />
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              {!editing && (
                <>
                  <button
                    onClick={quoteSelection}
                    disabled={uploading || recording}
                    aria-label="Quote selected text from the note"
                    title="Quote selected text from the note"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
                  >
                    <IconQuote size={17} />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || recording}
                    aria-label="Attach a photo or GIF"
                    title="Attach a photo or GIF"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
                  >
                    <IconPaperclip size={17} />
                  </button>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={uploading}
                    aria-label={recording ? "Stop recording" : "Record audio"}
                    title={recording ? "Stop recording" : "Record audio"}
                    className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] transition-colors disabled:opacity-40 ${
                      recording
                        ? "text-[var(--color-danger-strong)] bg-[var(--color-raised-soft)]"
                        : "text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)]"
                    }`}
                  >
                    {recording ? <IconPlayerStopFilled size={15} /> : <IconMicrophone size={17} />}
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={submit}
                disabled={(!text.trim() && !draft) || sending || uploading || recording}
                aria-label={editing ? "Save edit" : "Send message"}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <IconSend size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--color-border-secondary)] px-4 py-3 flex items-center gap-2 text-[12px] text-[var(--color-ink-5)]">
            <IconLock size={13} className="shrink-0" />
            Chat is read-only.
          </div>
        )}
      </aside>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Delete message"
        message="Delete this message? It'll show as “Message deleted” for everyone."
        confirmText="Delete"
      />
    </>
  );
}
