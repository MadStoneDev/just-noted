import React from "react";
import {
  IconPinFilled,
  IconNote,
  IconNotebook,
  IconCloud,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import { CombinedNote } from "@/types/combined-notes";
import { Notebook } from "@/types/notebook";
import { Tag } from "@/types/tag";
import { getPlainTextPreview } from "@/utils/html-utils";

// Shared presentational note card = the content column of a note list row (icon,
// title, notebook chip, preview, status row, tags). Used by the sidebar list and
// the split-view picker so both stay visually identical. Sidebar-only chrome
// (drag handle, swipe, select checkbox, delete button, active-card styling) lives
// in the caller's wrapper around this.
//
// Callbacks are optional: omit onStorageInfo / onNotebookClick and those bits
// render non-interactive, which is what the picker wants (pick a note, nothing
// else). onOpen is the row's primary click.

export function relativeTime(timestamp: number): string {
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

export function getNotePreview(content: string, maxLength = 60): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  return getPlainTextPreview(content, maxLength, isHtml ? "html" : "markdown");
}

interface NoteCardProps {
  note: CombinedNote;
  notebooks: Notebook[];
  tags: Tag[];
  noteTagMap: Record<string, string[]>;
  isSaving: boolean;
  onOpen: () => void;
  onStorageInfo?: (noteId: string) => void;
  onNotebookClick?: (notebookId: string) => void;
}

export default function NoteCard({
  note,
  notebooks,
  tags,
  noteTagMap,
  isSaving,
  onOpen,
  onStorageInfo,
  onNotebookClick,
}: NoteCardProps) {
  const saving = isSaving;
  const conflict = /conflicted copy/i.test(note.title || "");
  const local = note.source !== "supabase";
  const statusColor = saving
    ? "var(--color-warning)"
    : conflict
      ? "var(--color-danger-strong)"
      : local
        ? "var(--color-ink-6)"
        : "#3DA35D";
  const statusTitle = saving
    ? "Saving…"
    : conflict
      ? "Conflicted copy — review"
      : local
        ? "Saved on this device"
        : "Saved to cloud";

  const notebook = note.notebookId ? notebooks.find((nb) => nb.id === note.notebookId) : null;

  return (
    <div className="flex-1 min-w-0" onClick={onOpen}>
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
      {notebook &&
        (onNotebookClick ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNotebookClick(notebook.id);
            }}
            title={`Go to ${notebook.name}`}
            className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-px text-[11px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)] truncate max-w-[150px] transition-colors"
          >
            <IconNotebook size={10} className="shrink-0" />
            {notebook.name}
          </button>
        ) : (
          <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-px text-[11px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] truncate max-w-[150px]">
            <IconNotebook size={10} className="shrink-0" />
            {notebook.name}
          </span>
        ))}
      <p className="text-[13.5px] md:text-[11px] text-[var(--color-ink-5)] truncate mt-0.5 leading-relaxed">
        {getNotePreview(note.content) || "Empty note"}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        {onStorageInfo ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStorageInfo(note.id);
            }}
            title={statusTitle}
            aria-label={`${statusTitle}. What does this mean?`}
            className="flex items-center justify-center -m-1 p-1 rounded-full hover:bg-[var(--color-raised-soft)] transition-colors shrink-0"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${saving ? "animate-pulse" : ""}`}
              style={{ backgroundColor: statusColor }}
            />
          </button>
        ) : (
          <span className="flex items-center justify-center shrink-0" title={statusTitle}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${saving ? "animate-pulse" : ""}`}
              style={{ backgroundColor: statusColor }}
            />
          </span>
        )}
        {onStorageInfo ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStorageInfo(note.id);
            }}
            title="What does this mean?"
            className={`inline-flex items-center gap-1 px-1.5 py-px rounded-[var(--radius-sm)] transition-colors ${
              note.source === "supabase"
                ? "hover:bg-[var(--color-raised-soft)]"
                : "bg-[var(--color-warn-tint)] border border-[var(--color-warn-tint-border)] hover:brightness-95"
            }`}
          >
            {note.source === "supabase" ? (
              <IconCloud size={12} className="text-[var(--color-info)] flex-shrink-0" />
            ) : (
              <IconDeviceDesktop size={12} className="text-[var(--color-warning)] flex-shrink-0" />
            )}
            <span className={`text-[11px] ${note.source === "supabase" ? "text-[var(--color-ink-5)]" : "text-[var(--color-warning)] font-medium"}`}>
              {note.source === "supabase" ? "Cloud" : "On this device"}
            </span>
          </button>
        ) : (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-px rounded-[var(--radius-sm)] ${
              note.source === "supabase"
                ? ""
                : "bg-[var(--color-warn-tint)] border border-[var(--color-warn-tint-border)]"
            }`}
          >
            {note.source === "supabase" ? (
              <IconCloud size={12} className="text-[var(--color-info)] flex-shrink-0" />
            ) : (
              <IconDeviceDesktop size={12} className="text-[var(--color-warning)] flex-shrink-0" />
            )}
            <span className={`text-[11px] ${note.source === "supabase" ? "text-[var(--color-ink-5)]" : "text-[var(--color-warning)] font-medium"}`}>
              {note.source === "supabase" ? "Cloud" : "On this device"}
            </span>
          </span>
        )}
        <p className="text-[12px] text-[var(--color-ink-5)]">{relativeTime(note.updatedAt)}</p>
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
                style={{ backgroundColor: tag.color + "20", color: tag.color }}
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
  );
}
