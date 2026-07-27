"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/core";
import { callCommand } from "@milkdown/utils";
import { lift } from "@milkdown/prose/commands";
import { sinkListItem, liftListItem } from "@milkdown/prose/schema-list";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  insertImageCommand,
  turnIntoTextCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import {
  toggleStrikethroughCommand,
  insertTableCommand,
} from "@milkdown/preset-gfm";

export interface ActiveState {
  strong: boolean;
  emphasis: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  heading: number | null;
  paragraph: boolean;
  bulletList: boolean;
  orderedList: boolean;
  task: boolean;
  blockquote: boolean;
  codeBlock: boolean;
}

export const EMPTY_ACTIVE: ActiveState = {
  strong: false, emphasis: false, strike: false, code: false, link: false,
  heading: null, paragraph: false, bulletList: false, orderedList: false,
  task: false, blockquote: false, codeBlock: false,
};

function isMarkActive(state: EditorState, markName: string): boolean {
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, markType);
}

export function computeActive(state: EditorState): ActiveState {
  const { $from } = state.selection;
  const active: ActiveState = { ...EMPTY_ACTIVE };

  active.strong = isMarkActive(state, "strong");
  active.emphasis = isMarkActive(state, "emphasis");
  active.strike = isMarkActive(state, "strike_through");
  active.code = isMarkActive(state, "inlineCode");
  active.link = isMarkActive(state, "link");

  const parent = $from.parent;
  if (parent.type.name === "heading") active.heading = parent.attrs.level as number;
  if (parent.type.name === "paragraph") active.paragraph = true;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const name = node.type.name;
    if (name === "blockquote") active.blockquote = true;
    else if (name === "code_block") active.codeBlock = true;
    else if (name === "bullet_list") active.bulletList = true;
    else if (name === "ordered_list") active.orderedList = true;
    else if (name === "list_item" && node.attrs.checked != null) active.task = true;
  }

  return active;
}

export interface FormatActions {
  bold: () => void;
  italic: () => void;
  strike: () => void;
  code: () => void;
  toggleLink: () => void;
  paragraph: () => void;
  heading: (level: number) => void;
  list: (type: "bullet" | "ordered" | "task") => void;
  indent: () => void;
  outdent: () => void;
  blockquote: () => void;
  codeBlock: () => void;
  table: () => void;
  image: () => void;
  hr: () => void;
}

/**
 * Shared formatting command + active-state logic for the editor toolbars.
 * `active` reflects the current selection/cursor and updates on selectionchange,
 * so it works for an always-visible (docked) bar, not just an on-selection one.
 */
export function useFormatCommands(
  getEditor: () => Editor | undefined,
  containerRef: React.RefObject<HTMLElement | null>,
): { active: ActiveState; actions: FormatActions } {
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);

  const withView = useCallback(
    (fn: (view: EditorView, state: EditorState) => void) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          fn(view, view.state);
        });
      } catch {}
    },
    [getEditor],
  );

  const run = useCallback(
    (cmd: Parameters<typeof callCommand>[0], payload?: unknown) => {
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action(callCommand(cmd, payload));
      } catch {}
    },
    [getEditor],
  );

  const heading = useCallback(
    (level: number) => {
      withView((view, state) => {
        const { $from } = state.selection;
        const currentNode = $from.parent;
        if (currentNode.type.name === "heading" && currentNode.attrs.level === level) {
          const paragraphType = state.schema.nodes.paragraph;
          if (paragraphType) {
            view.dispatch(
              state.tr.setBlockType($from.before($from.depth), $from.after($from.depth), paragraphType),
            );
          }
        } else {
          run(wrapInHeadingCommand.key, level);
        }
      });
    },
    [withView, run],
  );

  const indent = useCallback(() => {
    withView((view, state) => {
      const itemType = state.schema.nodes.list_item;
      if (itemType) sinkListItem(itemType)(state, view.dispatch);
    });
  }, [withView]);

  const outdent = useCallback(() => {
    withView((view, state) => {
      const itemType = state.schema.nodes.list_item;
      if (itemType) liftListItem(itemType)(state, view.dispatch);
    });
  }, [withView]);

  const image = useCallback(() => {
    const src = prompt("Image URL:");
    if (src) run(insertImageCommand.key, { src });
  }, [run]);

  const list = useCallback(
    (type: "bullet" | "ordered" | "task") => {
      withView((view, state) => {
        const { $from } = state.selection;
        const schema = state.schema;

        let listItemDepth = -1;
        let listDepth = -1;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === "list_item") listItemDepth = d;
          if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
            listDepth = d;
            break;
          }
        }

        if (type === "task") {
          if (listItemDepth > 0) {
            const listItem = $from.node(listItemDepth);
            const pos = $from.before(listItemDepth);
            view.dispatch(
              state.tr.setNodeMarkup(pos, undefined, {
                ...listItem.attrs,
                checked: listItem.attrs.checked != null ? null : false,
              }),
            );
          } else {
            run(wrapInBulletListCommand.key);
            setTimeout(() => {
              const newState = view.state;
              const new$from = newState.selection.$from;
              for (let d = new$from.depth; d > 0; d--) {
                if (new$from.node(d).type.name === "list_item") {
                  view.dispatch(
                    newState.tr.setNodeMarkup(new$from.before(d), undefined, {
                      ...new$from.node(d).attrs,
                      checked: false,
                    }),
                  );
                  break;
                }
              }
            }, 0);
          }
        } else if (listDepth > 0) {
          const listNode = $from.node(listDepth);
          const targetType = type === "bullet" ? schema.nodes.bullet_list : schema.nodes.ordered_list;
          const wantedType = type === "bullet" ? "bullet_list" : "ordered_list";
          if (listNode.type.name === wantedType) {
            lift(state, view.dispatch);
          } else {
            view.dispatch(state.tr.setNodeMarkup($from.before(listDepth), targetType, listNode.attrs));
          }
        } else {
          run(type === "bullet" ? wrapInBulletListCommand.key : wrapInOrderedListCommand.key);
        }
      });
    },
    [withView, run],
  );

  const toggleBlock = useCallback(
    (blockName: string, wrapCommand: Parameters<typeof callCommand>[0]) => {
      withView((view, state) => {
        const { $from } = state.selection;
        let insideBlock = false;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === blockName) {
            insideBlock = true;
            lift(state, view.dispatch);
            break;
          }
        }
        if (!insideBlock) run(wrapCommand);
      });
    },
    [withView, run],
  );

  const toggleLink = useCallback(() => {
    withView((view, state) => {
      const { from, to } = state.selection;
      const linkType = state.schema.marks.link;
      if (!linkType) return;
      let hasLink = false;
      state.doc.nodesBetween(from, to, (node) => {
        if (node.marks.some((m) => m.type === linkType)) hasLink = true;
      });
      if (hasLink) {
        view.dispatch(state.tr.removeMark(from, to, linkType));
      } else {
        const url = prompt("Enter URL:");
        if (url) run(toggleLinkCommand.key, { href: url });
      }
    });
  }, [withView, run]);

  const actions: FormatActions = {
    bold: () => run(toggleStrongCommand.key),
    italic: () => run(toggleEmphasisCommand.key),
    strike: () => run(toggleStrikethroughCommand.key),
    code: () => run(toggleInlineCodeCommand.key),
    toggleLink,
    paragraph: () => run(turnIntoTextCommand.key),
    heading,
    list,
    indent,
    outdent,
    blockquote: () => toggleBlock("blockquote", wrapInBlockquoteCommand.key),
    codeBlock: () => toggleBlock("code_block", createCodeBlockCommand.key),
    table: () => run(insertTableCommand.key),
    image,
    hr: () => run(insertHrCommand.key),
  };

  // Keep `active` in sync with the caret/selection.
  useEffect(() => {
    const container = containerRef.current;
    const update = () => {
      const sel = window.getSelection();
      const anchor = sel?.anchorNode;
      if (container && anchor && !container.contains(anchor)) return;
      const editor = getEditor();
      if (!editor) return;
      try {
        editor.action((ctx) => setActive(computeActive(ctx.get(editorViewCtx).state)));
      } catch {}
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [getEditor, containerRef]);

  return { active, actions };
}
