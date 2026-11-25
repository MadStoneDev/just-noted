// src/utils/escape-stack.ts
// One Escape key, one layer. Every popover, modal and drawer registers here
// while it's open; Escape closes the most recently opened one and nothing else.
//
// Before this, each overlay added its own keydown listener, so one Escape could
// close a dropdown, the modal under it and the sidebar in one go. Here a single
// capture-phase window listener runs ahead of every other keydown listener
// (window capture is the first stop of the event's path). When a layer is open
// it closes the topmost one and stops the event, so no other listener, global
// shortcut or floating-ui dismiss sees it.

import { useEffect, useRef } from "react";

type Layer = { id: number; close: () => void };

const stack: Layer[] = [];
let nextId = 1;
let installed = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.close();
}

function install() {
  if (installed || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown, true);
  installed = true;
}

/** Register an open layer. Returns its unregister function. */
export function pushEscapeLayer(close: () => void): () => void {
  install();
  const layer = { id: nextId++, close };
  stack.push(layer);
  return () => {
    const i = stack.findIndex((l) => l.id === layer.id);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** True while any popover, modal or drawer is registered as open. */
export function hasEscapeLayer(): boolean {
  return stack.length > 0;
}

/** Test helper: drop every layer and the listener. */
export function resetEscapeStack(): void {
  stack.length = 0;
  if (installed && typeof window !== "undefined") window.removeEventListener("keydown", onKeyDown, true);
  installed = false;
}

/**
 * Registers `onClose` as an Escape layer while `active` is true. The layer
 * keeps its place in the stack across re-renders (the latest `onClose` is
 * called), so a parent re-rendering never jumps above a child opened later.
 */
export function useEscapeLayer(active: boolean, onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(() => ref.current());
  }, [active]);
}
