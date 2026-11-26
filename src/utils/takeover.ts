// What an editor does with text another tab left behind for its note, when it
// takes the note over (or, while it owns it, when a closing tab's handoff
// arrives late). Pure, so it is unit-tested on its own; the editor carries out
// the result (components/active-note-editor.tsx).
//
// The text can come from, strongest first:
//   - pending: a closing tab's handoff message (utils/leave-handoff), or a
//     queued offline update — text with a known base version;
//   - cached: the IDB cache copy, if it is an unconfirmed local edit
//     (localEdit) — the only trace left when the queue write and the handoff
//     both failed.
//
// Rule: never lose either side.
//   - Same text as the editor's → nothing.
//   - The editor is clean (nothing typed here yet):
//       made on the version the editor holds → ADOPT it as an edit (the
//         editor's autosave uploads it on that base);
//       made on another version → REPLAY it through the server CAS (apply,
//         copy or no-op — the server decides) and follow the server copy.
//   - The editor is dirty (the user already typed here) → COPY: send it as a
//     "(conflicted copy)" now. Adopting would replace the user's new words;
//     replaying it onto the note would put the other tab's text under the
//     user's unsaved edit. The note stays the user's current text.
//   - An empty cached copy never replaces text (as in the load reconcile).

import { sameNoteContent } from "./notes-utils";

export interface TakeoverInput {
  /** The editor's text right now (keystrokes flushed). */
  editorText: string;
  /** Nothing typed in this editor since its last confirmed/opening text. */
  clean: boolean;
  /** The note version the editor holds. */
  onVersion: number | undefined;
  pending?: { content: string; baseVersion?: number };
  cached?: { content: string; version?: number; localEdit?: unknown };
}

export type TakeoverDecision =
  | { kind: "none" }
  | { kind: "adopt"; content: string; base: number; from: "pending" | "cached" }
  | { kind: "replay"; from: "pending" | "cached" }
  | { kind: "copy"; from: "pending" | "cached" };

const hasText = (s: string | undefined) => !!s && s.trim().length > 0;

export function decideTakeover(input: TakeoverInput): TakeoverDecision {
  const { editorText, clean, onVersion, pending, cached } = input;
  let content: string;
  let base: number | undefined;
  let from: "pending" | "cached";
  if (pending) {
    content = pending.content;
    base = pending.baseVersion;
    from = "pending";
  } else if (cached && cached.localEdit) {
    if (!hasText(cached.content) && hasText(editorText)) return { kind: "none" };
    content = cached.content;
    base = cached.version;
    from = "cached";
  } else {
    return { kind: "none" };
  }
  if (sameNoteContent(content, editorText)) return { kind: "none" };
  if (!clean) return { kind: "copy", from };
  if (typeof base === "number" && base === onVersion) return { kind: "adopt", content, base, from };
  return { kind: "replay", from };
}
