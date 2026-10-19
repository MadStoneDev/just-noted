import type React from "react";
import type { ContentFormat } from "@/types/combined-notes";
import type MilkdownEditor from "@/components/editor/milkdown-editor";

// Shared, context-conditioned note surface. Both the standard editor (owner's
// store note) and the shared-note view normalise their data into a NoteViewModel
// + NoteCaps + NoteOps and render <NoteView>. Phase 1 migrates only the shared
// view; the owner editor follows in phase 2.

/** Normalised, source-agnostic note the view renders. */
export interface NoteViewModel {
  id: string;
  title: string;
  content: string;
  contentFormat: ContentFormat;
  goal?: number;
  goalType?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  isPinned?: boolean;
  source?: string;
  /** For shared notes: the owner's display identity. */
  authorUsername?: string | null;
  authorAvatar?: string | null;
  isAnonymous?: boolean;
}

/**
 * What this viewer can do with this note. Drives which chrome renders AND which
 * handler each control calls — so the same component serves owner and recipient.
 */
export interface NoteCaps {
  /** A shared/collab note (not a plain personal note) — drives the teal tell. */
  isShared: boolean;
  /** The current user owns this note. */
  isOwner: boolean;
  /** The content is editable by this viewer. */
  canEditContent: boolean;
  /** Show the Share control (owner only). */
  canShare: boolean;
  /** Pin is available (owner, or — later — a recipient with per-recipient pin). */
  canPin: boolean;
  /** Open a .txt/.md file into this note (owner only). */
  canOpenFile: boolean;
  /** Move to a notebook (owner only). */
  canMoveNotebook: boolean;
  /** Move between Local/Cloud (owner only). */
  canMoveSource: boolean;
  /** Delete the note (owner only). */
  canDelete: boolean;
  /** Version history is available. */
  hasVersions: boolean;
  /** Chat is available. */
  hasChat: boolean;
  /** The goal picker is interactive (owner only; recipients see it display-only). */
  showGoalPicker: boolean;
  /** The page-size picker is interactive (owner only). */
  showPagePicker: boolean;
}

/** Collab config passed straight through to MilkdownEditor. */
export type NoteViewCollab = NonNullable<
  React.ComponentProps<typeof MilkdownEditor>["collab"]
>;

/** Behavioural callbacks, wired per context (own vs shared). */
export interface NoteOps {
  /** Persist a title edit (editable notes). */
  onSaveTitle?: (title: string) => void;
  /** Persist a content edit (editable notes). */
  onSaveContent?: (markdown: string) => void;
  /** Fires once the editor mounts (load-emission timing). */
  onEditorReady?: () => void;
  /** Close/return (shared view). */
  onClose?: () => void;
  /** Copy the share link (shared view). */
  onCopyLink?: () => void;
  /** Open version history. */
  onHistory?: () => void;
  /** Live collaboration config — when set, the editor mounts into collab. */
  collab?: NoteViewCollab;
}
