"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  IconX,
  IconMessageCircle,
  IconSend,
  IconPencil,
  IconTrash,
  IconLock,
} from "@tabler/icons-react";
import { useNoteChat } from "@/hooks/use-note-chat";
import { sendChatMessage, editChatMessage, deleteOwnChatMessage } from "@/app/actions/chatActions";
import { ConfirmModal } from "@/components/ds/modal";
import { useToast } from "@/components/ui/toast";
import type { ChatMessageView } from "@/lib/chat";

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
        <p className="text-[13px] text-[var(--color-ink-2)] whitespace-pre-wrap break-words leading-snug">{m.body}</p>
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

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      <aside className="w-full sm:w-[340px] shrink-0 h-full min-h-0 bg-[var(--color-bg-elevated)] border-l border-[var(--color-border-secondary)] flex flex-col">
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
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message…"
                className="flex-1 resize-none max-h-32 px-3 py-2 text-[13px] bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent)] focus:bg-[var(--color-raised)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
              />
              <button
                onClick={submit}
                disabled={!text.trim() || sending}
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
