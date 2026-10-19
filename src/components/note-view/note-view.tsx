"use client";

import React, { useCallback, useState } from "react";
import MilkdownEditor from "@/components/editor/milkdown-editor";
import NoteStatsRow from "@/components/note-stats-row";
import AutoGrowTitle from "@/components/auto-grow-title";
import { Modal } from "@/components/ds/modal";
import { PresenceStack } from "@/components/presence-stack";
import NoteActionBar from "@/components/note-view/note-action-bar";
import type { PresenceUser } from "@/hooks/use-presence";
import {
  readWideDefault,
  readWideOverride,
  writeWideDefault,
  writeWideOverride,
  type WideLevel,
} from "@/utils/wide-view";
import { htmlToMarkdown } from "@/utils/html-to-markdown";
import type { NoteViewModel, NoteCaps, NoteOps } from "./types";

interface NoteViewProps {
  model: NoteViewModel;
  caps: NoteCaps;
  ops: NoteOps;

  /** Live title + content (editable), kept by the owner of the surface. */
  title: string;
  onTitleChange?: (v: string) => void;
  content: string;
  onContentChange?: (md: string) => void;

  /** Left side of the action bar (e.g. "Shared by @X · you can edit"). */
  contextLabel?: React.ReactNode;
  contextSubLabel?: React.ReactNode;

  /** Save/Sync status shown in the meta line. */
  statusLabel?: string;
  statusTone?: "normal" | "error";

  /** Presence avatars (shared notes). */
  presence?: PresenceUser[];
  chatUnread?: number;

  /** For the "…" menu's "Open in new tab" (shared notes). */
  shareLink?: string;

  /** Rendered between the title and the meta line (e.g. read-only byline). */
  byline?: React.ReactNode;
  /** Rendered between the meta line and the editor (e.g. a lock notice). */
  notice?: React.ReactNode;

  /** True while collab identity is resolving — shows a connecting message. */
  collabPending?: boolean;

  /** Rendered full-width directly under the action bar (e.g. history panel). */
  overlay?: React.ReactNode;
  /** Rendered beside the editor column (e.g. chat panel). */
  sidePanel?: React.ReactNode;
  /** When true the editor column hides on small screens (chat open). */
  sidePanelOpen?: boolean;
}

/**
 * The shared, context-conditioned note surface. Phase 1 renders the shared-note
 * view; the owner editor migrates onto it in phase 2. Capabilities (NoteCaps)
 * decide which chrome shows and the subtle teal "shared" tell; ops/handlers are
 * injected per context.
 */
export default function NoteView({
  model,
  caps,
  ops,
  title,
  onTitleChange,
  content,
  onContentChange,
  contextLabel,
  contextSubLabel,
  statusLabel,
  statusTone = "normal",
  presence,
  chatUnread = 0,
  shareLink,
  byline,
  notice,
  collabPending,
  overlay,
  sidePanel,
  sidePanelOpen,
}: NoteViewProps) {
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "source">("rendered");
  const [editorRemountKey, setEditorRemountKey] = useState(0);

  // Wide view — per-note override on top of a global default, keyed by note id.
  const [wideDefault, setWideDefault] = useState(() => readWideDefault());
  const [noteWide, setNoteWide] = useState(() => readWideOverride(model.id));
  const isWide = wideDefault || noteWide;
  const wideLevel: WideLevel = wideDefault ? "all" : noteWide ? "one" : "off";
  const wideTooltip =
    wideLevel === "all"
      ? "Wide view (all notes) — click to reset"
      : wideLevel === "one"
        ? "Wide view (this note) — click to apply to all"
        : "Wide view";
  const cycleWide = useCallback(() => {
    if (wideDefault) {
      writeWideDefault(false);
      writeWideOverride(model.id, false);
      setWideDefault(false);
      setNoteWide(false);
    } else if (noteWide) {
      writeWideDefault(true);
      setWideDefault(true);
    } else {
      writeWideOverride(model.id, true);
      setNoteWide(true);
    }
  }, [wideDefault, noteWide, model.id]);

  // Markdown source toggle. Source editing is disabled while live collab is on
  // (edits must flow through the Yjs doc, not a raw textarea).
  const sourceEditable = caps.canEditContent && !ops.collab;
  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === "rendered") {
        if (
          model.contentFormat !== "markdown" &&
          /<[a-z][\s\S]*>/i.test(content.trim())
        ) {
          onContentChange?.(htmlToMarkdown(content));
        }
        return "source";
      }
      setEditorRemountKey((k) => k + 1);
      return "rendered";
    });
  }, [content, model.contentFormat, onContentChange]);

  const isShared = caps.isShared;

  // With live collab the editor seeds from the canonical content and the Yjs doc
  // drives thereafter; without it, remounting from the live content keeps source
  // edits.
  const editorSeed = ops.collab ? model.content : content;

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${
        isShared ? "border border-[var(--color-accent-fill)]" : ""
      }`}
    >
      {/* Action bar (shared with the owner editor via NoteActionBar). */}
      <NoteActionBar
        isShared={isShared}
        left={
          <>
            {contextLabel && (
              <div
                className={`inline-flex items-center gap-1.5 min-w-0 text-[13px] ${
                  isShared ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-3)]"
                }`}
              >
                {contextLabel}
              </div>
            )}
            {contextSubLabel && (
              <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-accent-deep)] leading-tight">
                {contextSubLabel}
              </div>
            )}
          </>
        }
        presence={isShared && presence && presence.length > 0 ? <PresenceStack users={presence} /> : undefined}
        onHelp={() => setShowHelp(true)}
        chat={caps.hasChat && ops.onChat ? { onOpen: ops.onChat, unread: chatUnread } : undefined}
        onHistory={caps.hasVersions && ops.onHistory ? ops.onHistory : undefined}
        onCopyLink={isShared && ops.onCopyLink ? ops.onCopyLink : undefined}
        wide={{ isWide, tooltip: wideTooltip, onCycle: cycleWide }}
        markdown={{ viewMode, onToggle: toggleViewMode }}
        overflowItems={
          isShared
            ? [
                ...(shareLink
                  ? [{ label: "Open in new tab", onClick: () => window.open(shareLink, "_blank") }]
                  : []),
                ...(ops.onClose ? [{ label: "Close", onClick: ops.onClose }] : []),
              ]
            : undefined
        }
      />

      {overlay}

      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 flex-col min-w-0 ${sidePanelOpen ? "hidden lg:flex" : "flex"}`}>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div
              className={`mx-auto px-4 md:px-8 py-8 min-h-full flex flex-col transition-[max-width] duration-[var(--duration-slow)] ${
                isWide ? "max-w-none" : "max-w-[var(--content-width)]"
              }`}
            >
              {caps.canEditContent ? (
                <AutoGrowTitle
                  value={title}
                  onChange={(v) => onTitleChange?.(v)}
                  className="mb-1"
                />
              ) : (
                <h1 className="font-[family-name:var(--font-editor)] text-[32px] md:text-[46px] leading-[1.1] font-medium tracking-[-0.015em] text-[var(--color-ink)] mb-2">
                  {title || "Untitled"}
                </h1>
              )}

              {byline}

              <div className="flex items-center gap-2 flex-wrap mb-6">
                <NoteStatsRow content={content} goal={model.goal} goalType={model.goalType ?? undefined} />
                {statusLabel && (
                  <span
                    className={`text-[11px] font-[family-name:var(--font-meta)] ${
                      statusTone === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-accent-text)]"
                    }`}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>

              {notice}

              {collabPending ? (
                <div className="py-10 text-[13px] text-[var(--color-ink-4)]">
                  Connecting to the live document…
                </div>
              ) : viewMode === "source" ? (
                <textarea
                  value={content}
                  onChange={(e) => sourceEditable && onContentChange?.(e.target.value)}
                  readOnly={!sourceEditable}
                  spellCheck={false}
                  placeholder="# Markdown source"
                  className="flex-1 w-full resize-none bg-transparent border-none outline-none font-mono text-sm leading-relaxed text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
                />
              ) : (
                <MilkdownEditor
                  key={`${model.id}-${editorRemountKey}-${ops.collab ? "c" : "n"}`}
                  content={editorSeed || ""}
                  contentFormat={model.contentFormat || "markdown"}
                  onReady={ops.onEditorReady}
                  onChange={caps.canEditContent ? onContentChange : undefined}
                  readOnly={!caps.canEditContent}
                  toolbarContainer={caps.canEditContent ? toolbarSlot : undefined}
                  collab={ops.collab}
                />
              )}
            </div>
          </div>
          <div ref={setToolbarSlot} className="shrink-0 empty:hidden" />
        </div>
        {sidePanel}
      </div>

      {/* Formatting help modal */}
      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Formatting" size="sm">
        <div className="space-y-0.5 text-xs">
          <p className="text-[10px] text-[var(--color-ink-5)] mb-3">
            Select text to show the formatting toolbar. You can also type markdown directly:
          </p>
          {[
            ["**bold**", "Bold text"],
            ["*italic*", "Italic text"],
            ["~~strikethrough~~", "Strikethrough"],
            ["`code`", "Inline code"],
            ["# Heading 1", "Large heading"],
            ["## Heading 2", "Medium heading"],
            ["### Heading 3", "Small heading"],
            ["- item", "Bullet list"],
            ["1. item", "Numbered list"],
            ["- [ ] task", "Task / checkbox"],
            ["- [x] done", "Completed task"],
            ["> quote", "Blockquote"],
            ["```", "Code block"],
            ["---", "Horizontal rule"],
            ["[text](url)", "Link"],
            ["![alt](url)", "Image"],
          ].map(([syntax, desc]) => (
            <div
              key={syntax}
              className="flex items-center justify-between py-1.5 border-b border-[var(--color-hairline)] last:border-0"
            >
              <code className="px-1.5 py-0.5 bg-[var(--color-raised-soft)] rounded-[var(--radius-sm)] text-[11px] font-mono text-[var(--color-ink-3)]">
                {syntax}
              </code>
              <span className="text-[var(--color-ink-5)]">{desc}</span>
            </div>
          ))}
          <p className="text-[10px] text-[var(--color-ink-5)] pt-3">
            Keyboard: <kbd className="px-1 py-px bg-[var(--color-raised-soft)] rounded text-[10px] font-mono">Ctrl+B</kbd> bold ·{" "}
            <kbd className="px-1 py-px bg-[var(--color-raised-soft)] rounded text-[10px] font-mono">Ctrl+I</kbd> italic ·{" "}
            <kbd className="px-1 py-px bg-[var(--color-raised-soft)] rounded text-[10px] font-mono">Ctrl+Z</kbd> undo
          </p>
        </div>
      </Modal>
    </div>
  );
}
