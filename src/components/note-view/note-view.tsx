"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconLayoutColumns,
  IconDots,
  IconPrinter,
  IconDownload,
  IconExternalLink,
  IconPin,
  IconEye,
  IconEyeOff,
  IconTrash,
} from "@tabler/icons-react";
import MilkdownEditor from "@/components/editor/milkdown-editor";
import NoteStatsRow from "@/components/note-stats-row";
import AutoGrowTitle from "@/components/auto-grow-title";
import { Modal } from "@/components/ds/modal";
import { CommandPalette, type CommandPage } from "@/components/ds/command-palette";
import { PresenceStack } from "@/components/presence-stack";
import NoteActionBar, { barButtonClass } from "@/components/note-view/note-action-bar";
import ChatDrawer from "@/components/chat-drawer";
import { NoteSkeleton } from "@/components/note-view/note-skeleton";
import type { PresenceUser } from "@/hooks/use-presence";
import {
  readWideDefault,
  readWideOverride,
  writeWideDefault,
  writeWideOverride,
  type WideLevel,
} from "@/utils/wide-view";
import { htmlToMarkdown } from "@/utils/html-to-markdown";
import { exportNote } from "@/utils/export-note";
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
  shareLink,
  byline,
  notice,
  collabPending,
  overlay,
}: NoteViewProps) {
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "source">("rendered");
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  // Keep a skeleton over the body until the editor has actually mounted/loaded,
  // so we never flash "Connecting…" or an empty "Start writing…" placeholder
  // while a shared note is still loading. Reset when switching notes.
  const [editorReady, setEditorReady] = useState(false);
  // For a live-collab note the editor mounts (onReady) before its content
  // arrives via the async collab load(), so we also track when that load has
  // resolved+painted before dropping the skeleton. Non-collab notes have their
  // content at mount, so editorReady alone is enough.
  const [collabLoaded, setCollabLoaded] = useState(false);
  useEffect(() => {
    setEditorReady(false);
    setCollabLoaded(false);
  }, [model.id]);
  // The "…" opens a command-palette modal (same as the standard editor), not an
  // inline dropdown.
  const [commandOpen, setCommandOpen] = useState(false);

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
  // Wrap the collab load so the skeleton lifts only once the initial document
  // state has resolved AND the editor has painted it (two frames), instead of
  // on editor mount (which would flash an empty "Start writing…").
  const baseCollab = ops.collab;
  const baseLoad = baseCollab?.load;
  const collabForEditor = baseCollab
    ? {
        ...baseCollab,
        load: baseLoad
          ? async () => {
              try {
                const state = await baseLoad();
                requestAnimationFrame(() => requestAnimationFrame(() => setCollabLoaded(true)));
                return state;
              } catch (e) {
                // Never strand the skeleton on a failed load — reveal the editor.
                setCollabLoaded(true);
                throw e;
              }
            }
          : undefined,
      }
    : undefined;
  const hasCollab = !!ops.collab;
  const contentLoading = !editorReady || (hasCollab && !collabLoaded);
  // Safety net: if collab load never resolves, reveal the editor after a few
  // seconds rather than showing the skeleton forever.
  useEffect(() => {
    if (!hasCollab || collabLoaded || !editorReady) return;
    const t = setTimeout(() => setCollabLoaded(true), 8000);
    return () => clearTimeout(t);
  }, [hasCollab, collabLoaded, editorReady]);

  // The "…" command palette for a shared note: the recipient's own actions
  // (pin/hide/remove) plus the content-only actions (print/export/open).
  const ra = ops.recipientActions;
  const commandPage: CommandPage = {
    title: "Note actions",
    placeholder: "Search actions…",
    groups: [
      ...(ra
        ? [
            {
              id: "recipient",
              heading: "This note",
              items: [
                {
                  id: "pin",
                  label: ra.pinned ? "Unpin" : "Pin",
                  icon: <IconPin size={16} />,
                  perform: ra.onTogglePin,
                },
                ...(ra.source === "granted" && ra.onToggleHide
                  ? [
                      {
                        id: "hide",
                        label: ra.hidden ? "Unhide" : "Hide",
                        icon: ra.hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />,
                        perform: ra.onToggleHide,
                      },
                    ]
                  : []),
                ...(ra.source === "saved" && ra.onRemove
                  ? [
                      {
                        id: "remove",
                        label: "Remove from my shared notes",
                        icon: <IconTrash size={16} />,
                        destructive: true,
                        perform: ra.onRemove,
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      {
        id: "export",
        heading: "Export",
        items: [
          {
            id: "print",
            label: "Print / Save as PDF",
            icon: <IconPrinter size={16} />,
            perform: () => window.print(),
          },
          {
            id: "export-md",
            label: "Export Markdown (.md)",
            icon: <IconDownload size={16} />,
            perform: () => exportNote({ title, content, contentFormat: model.contentFormat }, "md"),
          },
          {
            id: "export-txt",
            label: "Export plain text (.txt)",
            icon: <IconDownload size={16} />,
            perform: () => exportNote({ title, content, contentFormat: model.contentFormat }, "txt"),
          },
          ...(shareLink
            ? [
                {
                  id: "newtab",
                  label: "Open in new tab",
                  icon: <IconExternalLink size={16} />,
                  perform: () => window.open(shareLink, "_blank"),
                },
              ]
            : []),
        ],
      },
    ],
  };

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
        onHistory={caps.hasVersions && ops.onHistory ? ops.onHistory : undefined}
        onCopyLink={isShared && ops.onCopyLink ? ops.onCopyLink : undefined}
        wide={{ isWide, tooltip: wideTooltip, onCycle: cycleWide }}
        markdown={{ viewMode, onToggle: toggleViewMode }}
        extras={
          ops.onToggleSplit ? (
            <button
              onClick={ops.onToggleSplit}
              title="Split view"
              className={`hidden md:inline-flex w-8 ${barButtonClass(isShared)}`}
            >
              <IconLayoutColumns size={16} />
            </button>
          ) : undefined
        }
        overflow={
          isShared ? (
            <button
              onClick={() => setCommandOpen(true)}
              title="Actions"
              className={`flex w-8 ${barButtonClass(isShared)}`}
            >
              <IconDots size={16} />
            </button>
          ) : undefined
        }
      />

      {overlay}

      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
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
                // Identity for live collab is still resolving — show a skeleton,
                // never a "Connecting…" line or an empty editor.
                <NoteSkeleton />
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
                <div className="relative flex-1 flex flex-col">
                  <MilkdownEditor
                    key={`${model.id}-${editorRemountKey}-${ops.collab ? "c" : "n"}`}
                    content={editorSeed || ""}
                    contentFormat={model.contentFormat || "markdown"}
                    onReady={() => {
                      setEditorReady(true);
                      ops.onEditorReady?.();
                    }}
                    onChange={caps.canEditContent ? onContentChange : undefined}
                    readOnly={!caps.canEditContent}
                    toolbarContainer={caps.canEditContent ? toolbarSlot : undefined}
                    collab={collabForEditor}
                  />
                  {/* Cover the editor until its content has actually loaded (for
                      collab notes, until load() resolves), so no empty
                      "Start writing…" placeholder flashes while the note loads. */}
                  {contentLoading && (
                    <div className="absolute inset-0 bg-[var(--color-canvas)]">
                      <NoteSkeleton />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div ref={setToolbarSlot} className="shrink-0 empty:hidden" />
        </div>
        {caps.hasChat && <ChatDrawer noteId={model.id} enabled />}
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

      {/* "…" command palette (modal), matching the standard editor. */}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} page={commandPage} />
    </div>
  );
}
