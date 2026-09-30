"use client";

import React, { useEffect, useRef, useState } from "react";
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
} from "@tabler/icons-react";
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

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold bg-[var(--color-raised-soft)] text-[var(--color-ink-4)]">
      {(name[0] || "?").toUpperCase()}
    </div>
  );
}

function MessageRow({
  m,
  onEdit,
  onDelete,
}: {
  m: ChatMessageView;
  onEdit: (m: ChatMessageView) => void;
  onDelete: (m: ChatMessageView) => void;
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
      <Avatar name={m.authorName} url={m.authorAvatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-medium text-[var(--color-ink-1)] truncate">{m.authorName}</span>
          <span className="text-[10.5px] text-[var(--color-ink-6)] shrink-0">{relativeTime(m.createdAt)}</span>
          {m.isEdited && <span className="text-[10px] text-[var(--color-ink-6)] shrink-0">(edited)</span>}
        </div>
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

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Upload an already-processed file/blob to the private bucket, then post it.
  const uploadAndSend = async (
    file: File | Blob,
    kind: "image" | "gif" | "audio",
    mime: string,
  ) => {
    setUploading(true);
    try {
      const req = await requestChatMediaUpload(noteId, kind, mime, file.size);
      if (!req.ok || !req.url || !req.key) {
        showError(req.error || "Couldn't start the upload");
        return;
      }
      const put = await fetch(req.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": baseMime(mime) },
      });
      if (!put.ok) { showError("Upload failed"); return; }
      const res = await sendChatMediaMessage(noteId, {
        key: req.key,
        kind,
        mime: baseMime(mime),
        meta: { size: file.size },
      });
      if (!res.success) { showError(res.error || "Couldn't send the attachment"); return; }
      await reload();
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const base = baseMime(f.type);
    if (base === "image/gif") { await uploadAndSend(f, "gif", "image/gif"); return; }
    if (base.startsWith("image/")) {
      // Canvas re-encode strips EXIF and normalises to webp.
      const webp = await compressImage(f, { maxDim: 1600, mimeType: "image/webp" });
      await uploadAndSend(webp, "image", "image/webp");
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
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime });
        if (blob.size > 0) await uploadAndSend(blob, "audio", mime);
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

  // Keep the newest message in view as messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!editing) return;
    setText(editing.body ?? "");
    inputRef.current?.focus();
  }, [editing]);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const res = editing
        ? await editChatMessage(editing.id, value)
        : await sendChatMessage(noteId, value);
      if (!res.success) {
        showError(res.error || "Couldn't send the message");
        return;
      }
      setText("");
      setEditing(null);
      await reload();
    } finally {
      setSending(false);
    }
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
                <MessageRow key={m.id} m={m} onEdit={setEditing} onDelete={setConfirmDelete} />
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
            <div className="flex items-end gap-1.5">
              {!editing && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={onPickFile}
                  />
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
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                disabled={uploading || recording}
                placeholder={uploading ? "Uploading…" : recording ? "Recording…" : "Message…"}
                className="flex-1 resize-none max-h-32 px-3 py-2 text-[13px] bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent)] focus:bg-[var(--color-raised)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] disabled:opacity-60"
              />
              <button
                onClick={submit}
                disabled={!text.trim() || sending || uploading || recording}
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
