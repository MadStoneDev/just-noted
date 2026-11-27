"use client";

import React, { useRef, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx, editorViewCtx, editorViewOptionsCtx, parserCtx, serializerCtx } from "@milkdown/core";
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";
import * as Y from "yjs";
import { collabDocIsBlank, COLLAB_FRAGMENT } from "@/utils/collab-doc";
import { seedCollabDoc } from "@/utils/collab-seed";
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { CollabLoadResult } from "@/lib/collab-client";
import { Awareness } from "y-protocols/awareness";
import { SupabaseYjsProvider } from "@/lib/yjs-supabase-provider";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { trailing } from "@milkdown/plugin-trailing";
import { indent, indentConfig } from "@milkdown/plugin-indent";
import { cursor } from "@milkdown/plugin-cursor";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/utils";
import { keymap } from "@milkdown/prose/keymap";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import { Slice, type Node as ProseNode } from "@milkdown/prose/model";
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from "y-prosemirror";
import { registerAnchorApi, type NoteAnchor } from "@/lib/note-anchor-bridge";
import { highlight } from "./highlight-plugin";
import {
  cleanCorruptedMarkdown,
  markdownStringifyOptions,
  emptyLineMarker,
} from "./markdown-io";
import DockedToolbar from "./docked-toolbar";
import SlashMenu from "./slash-menu";
import LinkPopover from "./link-popover";

import type { ContentFormat } from "@/types/combined-notes";
import { htmlToMarkdown } from "@/utils/html-to-markdown";
import { readEditorSpellcheck } from "@/utils/editor-font";
import { EDITING_INPUT_EVENTS, isEditingInputEvent } from "@/utils/editor-save-decision";

// Markdown-on-paste. When someone pastes plain text that contains Markdown
// (### headings, **bold**, - lists, > quotes, ``` fences, [links](…)), convert
// it to real formatting instead of dropping the literal characters in. Rich
// HTML pastes (from web pages) already carry structure, so those fall through
// to ProseMirror's default handler untouched — this only rescues plain-text
// sources like AI chats, code editors and terminals.
const MD_BLOCK = /(^|\n)[ \t]{0,3}(#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>[ \t]?|```|~~~)/;
const MD_INLINE = /\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\n]+\)/;
const RICH_HTML = /<(h[1-6]|ul|ol|li|pre|blockquote|table|thead|tbody|tr|td|th|img|a|strong|b|em|i|code|hr)\b/i;

const markdownPaste = $prose((ctx) =>
  new Plugin({
    key: new PluginKey("jn-markdown-paste"),
    props: {
      handlePaste: (view, event) => {
        if (!view.editable) return false;
        const cd = event.clipboardData;
        if (!cd) return false;
        const text = cd.getData("text/plain");
        if (!text || !text.trim()) return false;
        // Respect genuinely structured HTML — let the default paste keep it.
        const html = cd.getData("text/html");
        if (html && RICH_HTML.test(html)) return false;
        // Only intervene when the text actually looks like Markdown, so plain
        // prose keeps its exact characters.
        if (!MD_BLOCK.test(text) && !MD_INLINE.test(text)) return false;
        let doc;
        try {
          doc = ctx.get(parserCtx)(text);
        } catch {
          return false;
        }
        if (!doc || doc.content.size === 0) return false;
        const slice = Slice.maxOpen(doc.content);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        event.preventDefault();
        return true;
      },
    },
  })
);

const codeBlockEscape = $prose(() =>
  keymap({
    ArrowDown: (state, dispatch) => {
      const { $head } = state.selection;
      if ($head.node().type.name !== "code_block") return false;
      // Only when cursor is on the last line
      const textAfterCursor = $head.node().textContent.substring($head.parentOffset);
      if (textAfterCursor.includes("\n")) return false;
      const afterPos = $head.after();
      // If code block is at the end of the document, insert a paragraph after it
      if (afterPos >= state.doc.content.size && dispatch) {
        const tr = state.tr.insert(afterPos, state.schema.nodes.paragraph.create());
        dispatch(tr.setSelection((tr.selection.constructor as any).near(tr.doc.resolve(afterPos + 1))));
        return true;
      }
      return false;
    },
    ArrowUp: (state, dispatch) => {
      const { $head } = state.selection;
      if ($head.node().type.name !== "code_block") return false;
      // Only when cursor is on the first line
      const textBeforeCursor = $head.node().textContent.substring(0, $head.parentOffset);
      if (textBeforeCursor.includes("\n")) return false;
      const beforePos = $head.before();
      // If code block is at the start of the document, insert a paragraph before it
      if (beforePos === 0 && dispatch) {
        const tr = state.tr.insert(0, state.schema.nodes.paragraph.create());
        dispatch(tr.setSelection((tr.selection.constructor as any).near(tr.doc.resolve(1))));
        return true;
      }
      return false;
    },
  })
);

// Ctrl/Cmd+Alt+0–9 and Ctrl/Cmd+Alt+↑/↓ are the app's note-switching shortcuts
// (E1, use-keyboard-shortcuts). Milkdown's commonmark preset binds Mod-Alt-0…8
// to block commands (heading 1–6, paragraph, ordered/bullet list), and
// ProseMirror sees the keydown on the editor before it bubbles to the window
// listener — so switching away also turned the current block into a heading
// (a fresh note saved as "## …"). Claim these keys here so the editor ignores
// them and the event still bubbles to the note switcher. handleDOMEvents runs
// before every plugin's keymap, regardless of plugin order. Matched on
// event.code because macOS Option+digit changes event.key.
const NOTE_SWITCH_CODE = /^(Digit\d|Numpad\d|ArrowUp|ArrowDown)$/;
const noteSwitchKeys = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          keydown: (_view, event) =>
            (event.ctrlKey || event.metaKey) &&
            event.altKey &&
            !event.shiftKey &&
            NOTE_SWITCH_CODE.test(event.code),
        },
      },
    }),
);

// Backspace immediately after a markdown input rule fired (e.g. "1. " → a
// numbered list, "# " → a heading) should revert the conversion back to the
// literal text instead of deleting it. Milkdown's Backspace already chains
// undoInputRule, BUT a follow-up transaction (the trailing-paragraph plugin)
// clears prosemirror's input-rule undo state before Backspace is pressed, so the
// built-in behaviour never triggers. This plugin captures the undo info the
// moment a rule fires — surviving those follow-up transactions — and reverts it.
const inputRuleUndoKey = new PluginKey("jn-input-rule-undo");

interface InputRuleUndoable {
  transform: { steps: { invert(doc: unknown): unknown }[]; docs: unknown[] };
  from: number;
  to: number;
  text: string | null;
}

function readInputRulesUndoable(state: {
  plugins: readonly {
    spec: { isInputRules?: boolean };
    getState(s: unknown): unknown;
  }[];
}): InputRuleUndoable | null {
  for (const plugin of state.plugins) {
    if (plugin.spec?.isInputRules) {
      const stored = plugin.getState(state);
      if (stored) return stored as InputRuleUndoable;
    }
  }
  return null;
}

const inputRuleUndo = $prose(
  () =>
    new Plugin<InputRuleUndoable | null>({
      key: inputRuleUndoKey,
      state: {
        init: () => null,
        apply(tr, value) {
          const meta = tr.getMeta(inputRuleUndoKey);
          if (meta !== undefined) return meta as InputRuleUndoable | null;
          // Follow-up transactions (e.g. the trailing paragraph) must not clear
          // the captured undo; only a real edit / selection change does.
          if (tr.getMeta("appendedTransaction")) return value;
          if (tr.docChanged || tr.selectionSet) return null;
          return value;
        },
      },
      // Runs after every plugin's apply, so the input-rules plugin's fresh undo
      // state is readable here even though this plugin is ordered before it.
      appendTransaction(_trs, _oldState, newState) {
        const undoable = readInputRulesUndoable(
          newState as unknown as Parameters<typeof readInputRulesUndoable>[0],
        );
        if (undoable && inputRuleUndoKey.getState(newState) == null) {
          return newState.tr
            .setMeta(inputRuleUndoKey, undoable)
            .setMeta("addToHistory", false);
        }
        return null;
      },
      props: {
        handleKeyDown(view, event) {
          if (
            event.key !== "Backspace" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          ) {
            return false;
          }
          const undoable = inputRuleUndoKey.getState(view.state);
          if (!undoable) return false;

          const { transform, from, to, text } = undoable;
          const tr = view.state.tr;
          for (let j = transform.steps.length - 1; j >= 0; j--) {
            tr.step(transform.steps[j].invert(transform.docs[j]) as never);
          }
          if (text) {
            const marks = tr.doc.resolve(from).marks();
            tr.replaceWith(from, to, view.state.schema.text(text, marks));
          } else {
            tr.delete(from, to);
          }
          view.dispatch(tr);
          return true;
        },
      },
    }),
);

export interface CursorInfo {
  path: string[];
  marks: string[];
}

interface MilkdownEditorProps {
  content: string;
  contentFormat: ContentFormat;
  onChange?: (markdown: string) => void;
  /** Fires once when the editor view is mounted — used to time the load window. */
  onReady?: () => void;
  /**
   * Fires on each real input event in the editor (typing, deleting, paste,
   * drop, IME, an editing key; see isEditingInputEvent), BEFORE ProseMirror
   * handles it — so before the change it causes reaches onChange. Callers use
   * it to end the load window: after the user's first input, no emission is the
   * load re-serialisation (see decideEditorChange).
   */
  onUserInput?: () => void;
  /**
   * Filled with a function that emits any not-yet-reported change through
   * onChange SYNCHRONOUSLY. The listener plugin debounces markdownUpdated by
   * 200ms, so without this the last keystrokes before an unmount (note switch,
   * new note, tab close) fired into a destroyed editor and were lost.
   */
  flushRef?: React.MutableRefObject<(() => void) | null>;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  /**
   * When provided, the formatting toolbar is portaled into this element (e.g. a
   * full-width bar at the bottom of the editor pane) instead of rendering inline
   * inside the scrolling content. Falls back to inline when omitted.
   */
  toolbarContainer?: HTMLElement | null;
  /**
   * Enables live collaboration (design surface 05). All clients with the same
   * roomKey share a Yjs document over Supabase Realtime; edits merge without
   * conflicts and each person's caret shows in their colour.
   */
  collab?: CollabEditorConfig;
}

export interface CollabEditorConfig {
  roomKey: string;
  user: { name: string; color: string };
  /**
   * Load the persisted Yjs state (base64) — the note's canonical doc. `ok`
   * with state null means the note has no doc yet; `ok: false` means the load
   * failed, and the editor then never binds the doc (see `onState`).
   */
  load?: () => Promise<CollabLoadResult>;
  /**
   * Persist the Yjs state (base64), debounced by the editor. Resolves with the
   * server's merged state, which the editor applies (see lib/collab-merge.ts).
   */
  save?: (state: string) => Promise<string | null | void>;
  /**
   * The text the local editor's content was edited FROM, when that differs
   * from `content` (the owner's editor switches into collab after the note is
   * already open, and may carry plain-mode edits). Defaults to `content`.
   */
  base?: string;
  /**
   * Collab lifecycle for the host: "connecting" when this editor starts binding
   * (mount, remount), "ready" once bound to the doc, "unavailable" when the
   * load failed (it keeps retrying).
   */
  onState?: (state: "connecting" | "ready" | "unavailable") => void;
  /**
   * While the doc can't be loaded the editor stays unbound and retries (backoff,
   * and at once when back online). With this set it stays editable meanwhile —
   * for a host whose saves of an unbound editor are conflict-checked (the
   * owner's). Without it, it locks: a collaborator's saves aren't.
   */
  editableWhileUnavailable?: boolean;
  /** Local edits the doc superseded (it had moved on from `base`), for history. */
  onLocalSuperseded?: (markdown: string) => void;
  /**
   * Once bound: a reader of the doc's full state (base64; null while it can't
   * be saved), for the host's background writes (tab-close save, offline
   * queue), which merge it into the stored doc. Called with null on unbind.
   */
  onDocState?: (get: (() => string | null) | null) => void;
  /**
   * Doc states this device has that the server may not (edits made offline,
   * or in a tab that closed, still queued): merged into the doc right after
   * the load, before anything binds to it.
   */
  localStates?: () => Promise<string[]>;
}

// Stored note content → the Markdown the editor loads (legacy notes may hold HTML).
function toEditorMarkdown(content: string | null | undefined, contentFormat?: ContentFormat): string {
  if (!content) return "";
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content.trim());
  const actuallyMarkdown = contentFormat === "markdown" || !looksLikeHtml;
  const md = actuallyMarkdown ? content : htmlToMarkdown(content);
  return cleanCorruptedMarkdown(md);
}

// Uint8Array <-> base64 for shuttling Yjs state to/from the server.
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Records the loaded doc when the view mounts, as the baseline a synchronous
// flush compares against (so an untouched note never flushes a "change").
function seedEmittedDoc(ref: React.MutableRefObject<ProseNode | null>) {
  return $prose(
    () =>
      new Plugin({
        key: new PluginKey("JN_SEED_EMITTED_DOC"),
        view: (view) => {
          if (!ref.current) ref.current = view.state.doc;
          return {};
        },
      }),
  );
}

function MilkdownEditorInner({
  content,
  contentFormat,
  onChange,
  onReady,
  onUserInput,
  onFocus,
  onBlur,
  placeholder = "Start writing...",
  readOnly = false,
  className,
  toolbarContainer,
  collab: collabConfig,
  flushRef,
}: MilkdownEditorProps) {
  const collabEnabled = !!collabConfig;
  // The doc as of the last change we reported via onChange (seeded with the
  // loaded doc when the view mounts). A flush only emits if the live doc differs.
  const emittedDocRef = useRef<ProseNode | null>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onUserInputRef = useRef(onUserInput);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const readOnlyRef = useRef(readOnly);
  // Collab: true once the Yjs doc is loaded (or seeded) and the editor is bound
  // to it. Until then the editor is a plain editor showing the note's text.
  const collabReadyRef = useRef(false);
  // Collab: locked while a collaborator's doc can't be loaded (retrying).
  const collabLockedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  onChangeRef.current = onChange;
  onReadyRef.current = onReady;
  onUserInputRef.current = onUserInput;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;
  readOnlyRef.current = readOnly;

  const initialMarkdown = useMemo(() => toEditorMarkdown(content, contentFormat), []);

  const { get } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        // Lock ProseMirror editing in read-only mode (the data-readonly styling
        // alone didn't stop edits). Reads a ref so it stays correct if readOnly
        // changes without rebuilding the editor.
        ctx.set(editorViewOptionsCtx, {
          editable: () => !readOnlyRef.current && !collabLockedRef.current,
          attributes: { spellcheck: readEditorSpellcheck() ? "true" : "false" },
        });
        // Collab mode too starts from the note's text: the editor shows it (and
        // takes input) as a plain editor until the Yjs doc is ready, then binds
        // to the doc — never to an empty doc in the meantime (see the bind).
        ctx.set(defaultValueCtx, initialMarkdown);
        ctx.set(remarkStringifyOptionsCtx, markdownStringifyOptions);
        ctx.set(indentConfig.key, {
          type: "space" as const,
          size: 2,
        });

        ctx.get(listenerCtx)
          .markdownUpdated((lctx, markdown, prevMarkdown) => {
            if (markdown === prevMarkdown) return;
            // Already reported by a synchronous flush — don't emit it twice.
            try {
              const doc = lctx.get(editorViewCtx).state.doc;
              if (emittedDocRef.current?.eq(doc)) return;
              emittedDocRef.current = doc;
            } catch {}
            onChangeRef.current?.(markdown);
          })
          .focus(() => {
            onFocusRef.current?.();
          })
          .blur(() => {
            onBlurRef.current?.();
          });
      })
      .use(commonmark)
      .use(gfm)
      // Intentional empty lines: `&nbsp;` lines parse back to empty paragraphs
      // (the save half is in markdownStringifyOptions).
      .use(emptyLineMarker)
      .use(highlight)
      .use(listener)
      .use(history)
      .use(markdownPaste)
      .use(clipboard)
      .use(trailing)
      .use(indent)
      .use(cursor)
      .use(codeBlockEscape)
      .use(noteSwitchKeys)
      .use(inputRuleUndo)
      .use(seedEmittedDoc(emittedDocRef))
      .use(collabEnabled ? collab : []);
  }, []);

  // Synchronous flush of a change the debounced listener hasn't reported yet.
  // Callers run this before saving on unmount / pagehide / explicit flush.
  // Not in collab mode: there the Yjs doc is the source of truth with its own
  // persistence, and remote updates (addToHistory=false, which the listener
  // deliberately ignores) would otherwise be flushed as if they were local edits.
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = () => {
      // Once bound to the doc, the doc has its own persistence (above).
      if (collabEnabled && collabReadyRef.current) return;
      try {
        get()?.action((ctx) => {
          const doc = ctx.get(editorViewCtx).state.doc;
          if (!emittedDocRef.current || emittedDocRef.current.eq(doc)) return;
          emittedDocRef.current = doc;
          const markdown = ctx.get(serializerCtx)(doc);
          onChangeRef.current?.(markdown);
        });
      } catch {
        // Editor not created yet / already destroyed — nothing to flush.
      }
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, get, collabEnabled]);

  // ProseMirror caches `editable` — re-apply it when readOnly changes so the
  // main editor un-locks after hydration and a read-only view stays locked.
  useEffect(() => {
    try {
      get()?.action((ctx) => {
        const view = ctx.get(editorViewCtx) as any;
        view.setProps({ editable: () => !readOnlyRef.current && !collabLockedRef.current });
      });
    } catch {}
  }, [readOnly, get]);

  // Edits applied by code on the user's behalf (toolbar, slash menu, link
  // popover, task checkbox) are user input too: report them before applying,
  // or one made in the first second is taken for the load re-serialisation.
  const reportProgrammaticInput = useCallback(() => {
    onUserInputRef.current?.();
  }, []);

  // Report real input (capture phase: ahead of ProseMirror's own handlers, so
  // ahead of the change they emit).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onInput = (e: Event) => {
      if (isEditingInputEvent(e as KeyboardEvent)) onUserInputRef.current?.();
    };
    for (const t of EDITING_INPUT_EVENTS) el.addEventListener(t, onInput, true);
    return () => {
      for (const t of EDITING_INPUT_EVENTS) el.removeEventListener(t, onInput, true);
    };
  }, []);

  // Fire onReady once, as soon as the editor instance exists. Consumers use this
  // to time the "load re-serialisation" window from the editor actually mounting
  // (not from React render), so a slow lazy-load can't push the first emission
  // outside the window and make opening a note look like an edit.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current) return;
    if (!get()) return;
    readyFiredRef.current = true;
    onReadyRef.current?.();
  }, [get]);

  // Live collaboration: bind a Yjs doc + awareness synced over Supabase Realtime.
  //
  // The editor is NEVER bound to a doc that isn't ready. Until the persisted
  // state is loaded (or, for a note with no doc yet, seeded from its text), it
  // is a plain editor showing the note: typing works, and nothing reaches the
  // doc. Typing into an empty doc in that window used to skip the seed, so the
  // doc — and every save projected from it — held only what was typed, and the
  // body was gone (docs/diagnostics/shared-note-overwrite).
  //
  //  1. Load. Failed → never bind or persist; retry (backoff, or when back
  //     online), editable meanwhile only for a host that asks for it.
  //  2. No doc yet → seed deterministically (seedCollabDoc): at once when alone
  //     in the room, after a peer's state had its chance to arrive otherwise.
  //  3. Local edits made meanwhile → written into the doc as a diff, when the
  //     doc still holds the text they were made from; otherwise the doc wins
  //     and the local text goes to the host (onLocalSuperseded) for history.
  //  4. Connect: the editor now renders the doc (same text, cursor kept).
  useEffect(() => {
    if (!collabConfig) return;
    let cancelled = false;
    let provider: SupabaseYjsProvider | null = null;
    let doc: Y.Doc | null = null;
    let service: any = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;
    let reprojectTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingPersist = false;
    let persistHandler: ((u: Uint8Array, origin: unknown) => void) | null = null;
    let unregisterAnchor: (() => void) | null = null;
    collabReadyRef.current = false;
    collabConfig.onState?.("connecting");

    const persistNow = () => {
      // Never before the doc is loaded or seeded: a doc that didn't load must
      // never reach the server (it would stand in for the real one).
      if (!doc || !collabConfig.save || !collabReadyRef.current) return;
      pendingPersist = false;
      // Never persist a BLANK doc for a note that has text.
      try {
        if (collabDocIsBlank(doc) && initialMarkdown) return;
      } catch {}
      const d = doc;
      try {
        void Promise.resolve(collabConfig.save(bytesToB64(Y.encodeStateAsUpdate(d))))
          .then((merged) => {
            // Whatever the server holds that we missed (dropped broadcasts).
            if (merged && !cancelled && doc === d) Y.applyUpdate(d, b64ToBytes(merged), "server");
          })
          .catch(() => {});
      } catch {}
    };

    const setLocked = (locked: boolean) => {
      collabLockedRef.current = locked;
      try {
        get()?.action((ctx) => {
          (ctx.get(editorViewCtx) as any).setProps({ editable: () => !readOnlyRef.current && !collabLockedRef.current });
        });
      } catch {}
    };

    const onOnline = () => {
      // Bound: save now. Edits made offline never reached the server, and the
      // merged state it answers with brings in what peers did meanwhile.
      if (collabReadyRef.current) {
        persistNow();
        return;
      }
      if (!retryTimer) return; // not waiting on a retry
      clearTimeout(retryTimer);
      retryTimer = null;
      void bind();
    };

    // Re-project the doc into the note's content (the host saves it), once
    // things go quiet. The listener reports only local edits, so without this
    // the content keeps whichever client saved last.
    const scheduleReproject = () => {
      if (!onChangeRef.current || readOnlyRef.current) return;
      if (reprojectTimer) clearTimeout(reprojectTimer);
      reprojectTimer = setTimeout(() => {
        reprojectTimer = null;
        try {
          get()?.action((ctx) => {
            const d = ctx.get(editorViewCtx).state.doc;
            if (emittedDocRef.current?.eq(d)) return;
            emittedDocRef.current = d;
            onChangeRef.current?.(ctx.get(serializerCtx)(d));
          });
        } catch {}
      }, 1500);
    };

    const waitFor = (cond: () => boolean, ms: number) =>
      new Promise<void>((resolve) => {
        const t0 = Date.now();
        const tick = () => (cancelled || cond() || Date.now() - t0 >= ms ? resolve() : setTimeout(tick, 50));
        tick();
      });

    const load = async (): Promise<CollabLoadResult> => {
      if (!collabConfig.load) return { ok: true, state: null };
      try {
        return await collabConfig.load();
      } catch {
        return { ok: false };
      }
    };

    const bind = async (): Promise<void> => {
      if (cancelled) return;
      const editor = get();
      if (!editor) {
        requestAnimationFrame(() => { void bind(); });
        return;
      }
      if (!doc) {
        doc = new Y.Doc();
        const awareness = new Awareness(doc);
        awareness.setLocalStateField("user", {
          name: collabConfig.user.name,
          color: collabConfig.user.color,
        });
        provider = new SupabaseYjsProvider(collabConfig.roomKey, doc, awareness);
        editor.action((ctx: any) => {
          service = ctx.get(collabServiceCtx);
          service.bindDoc(doc).setAwareness(awareness); // connected only once ready
        });
        // Persist on change (debounced); before ready, remember it for later.
        persistHandler = (_u, origin) => {
          if (origin === "load") return;
          const fromPeer = origin === provider || origin === "server";
          if (!collabReadyRef.current) { pendingPersist = true; return; }
          if (origin !== "server") {
            // (The server's own state needs no saving back.)
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(persistNow, 1200);
          }
          // A peer's edit: re-project the doc once peers go quiet. Otherwise
          // the note's content keeps whichever client saved last, possibly
          // before it had everyone's text.
          if (fromPeer) scheduleReproject();
        };
        doc.on("update", persistHandler);
      }

      // 1. Load the canonical doc.
      const res = await load();
      if (cancelled) return;
      if (!res.ok) {
        collabConfig.onState?.("unavailable");
        if (!collabConfig.editableWhileUnavailable) setLocked(true);
        retryTimer = setTimeout(() => { retryTimer = null; void bind(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
        return;
      }
      if (res.state) {
        try { Y.applyUpdate(doc!, b64ToBytes(res.state), "load"); } catch {}
      }
      // This device's own unsynced doc edits (queued): a CRDT merge, so they
      // join whatever the server has, and are saved once bound.
      if (collabConfig.localStates) {
        let states: string[] = [];
        try { states = await collabConfig.localStates(); } catch {}
        if (cancelled) return;
        for (const s of states) {
          try { Y.applyUpdate(doc!, b64ToBytes(s), "local-queued"); } catch {}
        }
      }

      // 2. No doc yet: seed from the text everyone has (the note's content).
      const baseMarkdown = collabConfig.base !== undefined ? toEditorMarkdown(collabConfig.base, contentFormat) : initialMarkdown;
      if (collabDocIsBlank(doc!) && baseMarkdown.trim()) {
        const others = await provider!.othersOnJoin(1500);
        if (cancelled) return;
        if (others !== 0 && collabDocIsBlank(doc!)) {
          // Someone else is here (or we can't tell): their state may be on its way.
          await waitFor(() => !collabDocIsBlank(doc!), 1500);
          if (cancelled) return;
          if (collabDocIsBlank(doc!)) {
            const again = await load();
            if (cancelled) return;
            if (again.ok && again.state) {
              try { Y.applyUpdate(doc!, b64ToBytes(again.state), "load"); } catch {}
            }
          }
        }
        if (collabDocIsBlank(doc!)) {
          editor.action((ctx: any) => {
            const node = ctx.get(parserCtx)(baseMarkdown);
            if (node && typeof node !== "string") seedCollabDoc(doc!, node, collabConfig.roomKey, baseMarkdown);
          });
        }
      }
      if (cancelled) return;

      // 3 + 4. Carry local edits over, then bind the editor to the doc. One
      // synchronous step, so no keystroke can land in between.
      let docMovedOn = false;
      editor.action((ctx: any) => {
        const view = ctx.get(editorViewCtx);
        const parse = ctx.get(parserCtx);
        const serialize = ctx.get(serializerCtx);
        const schema = view.state.schema;
        const norm = (md: string) => md.replace(/\u00a0/g, " ").replace(/\s+$/, "");
        const md = (node: ProseNode | null) => (node ? norm(serialize(node)) : "");
        const fragment = doc!.getXmlFragment(COLLAB_FRAGMENT);
        const localNode = view.state.doc as ProseNode;
        const localMd = md(localNode);
        const baseNode = baseMarkdown ? parse(baseMarkdown) : null;
        const baseMd = baseNode && typeof baseNode !== "string" ? md(baseNode) : "";
        const docMd = md(yXmlFragmentToProseMirrorRootNode(fragment, schema) as ProseNode);
        // The doc holds text the note's content doesn't (a background write
        // merged into it, a peer's edit whose projection never landed).
        docMovedOn = docMd !== baseMd;
        if (localMd !== docMd && localMd !== baseMd) {
          if (docMd === baseMd) {
            doc!.transact(() => {
              updateYFragment(doc!, fragment, localNode, { mapping: new Map(), isOMark: new Map() } as any);
            }, "local");
          } else {
            try { collabConfig.onLocalSuperseded?.(serialize(localNode)); } catch {}
          }
        }
        // Connecting reconfigures the view's plugins, which drops DOM focus:
        // put focus (and the caret, which ySync keeps) back in the same step,
        // so typing that is under way carries straight on.
        const hadFocus = view.hasFocus();
        service.connect();
        if (hadFocus && !view.hasFocus()) view.focus();
      });
      collabReadyRef.current = true;
      setLocked(false);
      if (pendingPersist) persistNow();
      collabConfig.onState?.("ready");
      {
        const d = doc!;
        collabConfig.onDocState?.(() => {
          if (cancelled || doc !== d || !collabReadyRef.current) return null;
          if (collabDocIsBlank(d) && initialMarkdown) return null; // never a blank doc for a note with text
          return bytesToB64(Y.encodeStateAsUpdate(d));
        });
      }
      // Bring the note's content up to the doc it now shows.
      if (docMovedOn) scheduleReproject();

      // Anchor API for the chat panel: capture the current selection as Yjs
      // relative positions (+ a quote fallback), and resolve/scroll/flash one.
      const captureAnchor = (): NoteAnchor | null => {
        const editor = get();
        if (!editor || !doc) return null;
        let out: NoteAnchor | null = null;
        try {
          editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx) as any;
            const st = view.state;
            const { from, to } = st.selection;
            if (from === to) return;
            const ys: any = ySyncPluginKey.getState(st);
            if (!ys?.type || !ys.binding?.mapping) return;
            const relStart = absolutePositionToRelativePosition(from, ys.type, ys.binding.mapping);
            const relEnd = absolutePositionToRelativePosition(to, ys.type, ys.binding.mapping);
            const quote = (st.doc.textBetween(from, to, " ") || "").trim().slice(0, 300);
            if (!quote) return;
            out = {
              relStart: bytesToB64(Y.encodeRelativePosition(relStart)),
              relEnd: bytesToB64(Y.encodeRelativePosition(relEnd)),
              quote,
            };
          });
        } catch {}
        return out;
      };
      const scrollToAnchor = (a: NoteAnchor): boolean => {
        const editor = get();
        if (!editor || !doc) return false;
        let ok = false;
        try {
          editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx) as any;
            const st = view.state;
            const ys: any = ySyncPluginKey.getState(st);
            if (!ys?.type || !ys.binding?.mapping) return;
            const relS = Y.decodeRelativePosition(b64ToBytes(a.relStart));
            const relE = Y.decodeRelativePosition(b64ToBytes(a.relEnd));
            const absS = relativePositionToAbsolutePosition(doc!, ys.type, relS, ys.binding.mapping);
            const absE = relativePositionToAbsolutePosition(doc!, ys.type, relE, ys.binding.mapping);
            if (absS == null || absE == null) return;
            const lo = Math.min(absS, absE);
            const hi = Math.max(absS, absE);
            view.dispatch(st.tr.setSelection(TextSelection.create(st.doc, lo, hi)).scrollIntoView());
            view.focus();
            try {
              const at = view.domAtPos(lo);
              const node = at?.node as Node | undefined;
              const el = (node?.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
              if (el) { el.classList.add("anchor-flash"); setTimeout(() => el.classList.remove("anchor-flash"), 1600); }
            } catch {}
            ok = true;
          });
        } catch {}
        return ok;
      };
      unregisterAnchor = registerAnchorApi(collabConfig.roomKey, { capture: captureAnchor, scrollTo: scrollToAnchor });
    };
    window.addEventListener("online", onOnline);
    void bind();

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      unregisterAnchor?.();
      if (retryTimer) clearTimeout(retryTimer);
      if (reprojectTimer) clearTimeout(reprojectTimer);
      if (saveTimer) clearTimeout(saveTimer);
      if (doc && persistHandler) doc.off("update", persistHandler);
      persistNow(); // flush final state on unmount (only if it was ever ready)
      collabConfig.onDocState?.(null);
      try { service?.disconnect(); } catch {}
      provider?.destroy();
      doc?.destroy();
      collabReadyRef.current = false;
      collabLockedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabConfig?.roomKey]);

  const handleTaskClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const li = target.closest("li[data-item-type='task']") as HTMLElement | null;
    if (!li) return;

    // Only toggle if click is in the checkbox area: the item's left padding in
    // an all-task list, or the bullet gutter left of the item in a mixed list
    // (where the item has no padding; see globals.css).
    const rect = li.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const padded = parseFloat(getComputedStyle(li).paddingLeft) > 0;
    if (clickX > (padded ? 28 : 0)) return; // past the checkbox area

    e.preventDefault();
    e.stopPropagation();

    const editor = get();
    if (!editor) return;
    reportProgrammaticInput();

    try {
      editor.action((ctx: any) => {
        const view = ctx.get(editorViewCtx) as any;
        const pos = view.posAtDOM(li, 0);
        const { state } = view;
        const resolved = state.doc.resolve(pos);

        // Walk up to find the list_item node
        for (let d = resolved.depth; d >= 0; d--) {
          const node = resolved.node(d);
          if (node.type.name === "list_item" && node.attrs.checked != null) {
            const from = resolved.before(d);
            const tr = state.tr.setNodeMarkup(from, undefined, {
              ...node.attrs,
              checked: !node.attrs.checked,
            });
            view.dispatch(tr);
            break;
          }
        }
      });
    } catch {}
  }, [get, reportProgrammaticInput]);

  return (
    <div
      ref={containerRef}
      className={`milkdown relative ${className || ""}`}
      data-placeholder={placeholder}
      data-readonly={readOnly || undefined}
      onClick={handleTaskClick}
    >
      {!readOnly && (
        <>
          <SlashMenu getEditor={get} containerRef={containerRef} onBeforeEdit={reportProgrammaticInput} />
          <LinkPopover getEditor={get} containerRef={containerRef} onBeforeEdit={reportProgrammaticInput} />
        </>
      )}
      <Milkdown />
      {!readOnly &&
        (toolbarContainer ? (
          createPortal(
            <DockedToolbar getEditor={get} containerRef={containerRef} onBeforeEdit={reportProgrammaticInput} />,
            toolbarContainer,
          )
        ) : (
          <DockedToolbar getEditor={get} containerRef={containerRef} onBeforeEdit={reportProgrammaticInput} />
        ))}
    </div>
  );
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}

export default MilkdownEditor;
