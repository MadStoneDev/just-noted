// One upload path per note.
//
// A note that is open in an editor is OWNED by that editor: only its autosave
// uploads the note, until the editor closes and its last save has finished.
// Ownership is a per-note Web Lock (`jn-note-edit:{id}`), so it holds across
// tabs too: a second tab with the same note open waits for the lock and shows
// the note read-only, following the owner's saves, until the owner lets go.
//
// Background writers (the refresh guard, the startup reconcile, the offline
// queue) never write an owned note themselves:
//   - owned in THIS tab  → hand the text to the editor (registerUploader), so
//     it goes out through the editor's own versioned save; or skip it when the
//     editor's own save will carry it anyway;
//   - owned in ANOTHER tab, or a save is in flight → skip it.
//
// Where Web Locks aren't available (very old browsers) every editor owns its
// note, as before: same-tab behaviour is unchanged, cross-tab is best-effort.

import { useNotesStore } from "@/stores/notes-store";
import type { CombinedNote } from "@/types/combined-notes";

const LOCK_PREFIX = "jn-note-edit:";

type LockManagerLike = {
  request: (name: string, opts: { mode: "exclusive"; signal?: AbortSignal }, cb: () => Promise<void>) => Promise<void>;
  query?: () => Promise<{ held?: { name?: string }[] }>;
};

function locks(): LockManagerLike | null {
  const nav = typeof navigator !== "undefined" ? (navigator as any) : undefined;
  return nav?.locks?.request ? (nav.locks as LockManagerLike) : null;
}

/** Notes whose edit lock THIS tab holds (an open, owning editor). */
const ownedHere = new Set<string>();

/**
 * Ask for ownership of a note. If nobody holds it, it's ours at once
 * (`onOwned`). If another tab holds it, `onBusy` runs and we queue for it;
 * `onOwned` runs when that tab lets go. Returns `release(beforeRelease?)`: it
 * stops waiting, or, if owned, awaits `beforeRelease` (e.g. "let the last save
 * land") and then lets go.
 */
export function acquireNoteOwnership(
  noteId: string,
  onOwned: () => void,
  onBusy: () => void = () => {},
): (beforeRelease?: () => Promise<void>) => void {
  const lm = locks();
  if (!lm) {
    ownedHere.add(noteId);
    onOwned();
    return (beforeRelease) => {
      Promise.resolve(beforeRelease?.()).finally(() => ownedHere.delete(noteId));
    };
  }

  const name = `${LOCK_PREFIX}${noteId}`;
  const abort = new AbortController();
  let letGo: (() => void) | null = null;
  let released = false;
  const held = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  const own = async () => {
    if (released) return; // released while the grant was on its way
    ownedHere.add(noteId);
    try {
      onOwned();
      await held;
    } finally {
      ownedHere.delete(noteId);
    }
  };

  // Free → ours now. Held elsewhere → tell the editor, then wait in line.
  (lm.request as any)(name, { mode: "exclusive", ifAvailable: true }, async (lock: unknown) => {
    if (lock) return own();
    if (released) return;
    onBusy();
    lm.request(name, { mode: "exclusive", signal: abort.signal }, own).catch(() => {
      /* AbortError: we stopped waiting */
    });
  }).catch(() => {});

  return (beforeRelease) => {
    if (released) return;
    released = true;
    if (!ownedHere.has(noteId)) {
      abort.abort(); // still waiting — just leave the queue
      return;
    }
    Promise.resolve(beforeRelease?.())
      .catch(() => {})
      .finally(() => letGo?.());
  };
}

/** True when this tab's editor owns the note. */
export function isOwnedHere(noteId: string): boolean {
  return ownedHere.has(noteId);
}

/**
 * Every note that must not get a background write right now: owned by an
 * editor in any tab of this browser, or with a save in flight in this tab.
 */
export async function notesNotToWrite(): Promise<Set<string>> {
  const out = new Set<string>(ownedHere);
  for (const id of useNotesStore.getState().isSaving.keys()) out.add(id);
  const lm = locks();
  if (lm?.query) {
    try {
      const snap = await lm.query();
      for (const l of snap.held ?? []) {
        if (l.name?.startsWith(LOCK_PREFIX)) out.add(l.name.slice(LOCK_PREFIX.length));
      }
    } catch {
      /* query unsupported — local view only */
    }
  }
  return out;
}

/** Resolves once this tab has no save in flight for the note (or after `maxMs`). */
export function waitForNoSaveInFlight(noteId: string, maxMs = 15_000): Promise<void> {
  if (!useNotesStore.getState().isSaving.has(noteId)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsub();
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    const unsub = useNotesStore.subscribe((s) => {
      if (!s.isSaving.has(noteId)) done();
    });
  });
}

// ── Hand-off to the owning editor ──────────────────────────────────────────

/** What a background path may ask of the editor that owns a note in this tab. */
export interface EditorHandle {
  /** Upload `note`'s text through the editor's own save (base = note.version),
   *  if it is still what the editor holds; otherwise the editor's own pending
   *  save already carries newer text. */
  upload: (note: CombinedNote) => void;
  /** Put new text in the editor as an edit, saved by its autosave. */
  replaceContent: (content: string) => void;
  /** The editor's text right now (including keystrokes not yet reported). */
  currentContent: () => string;
}
const handles = new Map<string, EditorHandle>();

export function registerEditorHandle(noteId: string, handle: EditorHandle): () => void {
  handles.set(noteId, handle);
  return () => {
    if (handles.get(noteId) === handle) handles.delete(noteId);
  };
}

/** The owning editor's handle, when this tab owns the note. */
export function editorHandleFor(noteId: string): EditorHandle | undefined {
  return ownedHere.has(noteId) ? handles.get(noteId) : undefined;
}
