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
//
// Click-outside follows the same rule: one capture-phase pointerdown listener
// asks only the TOPMOST layer whether the press was outside it. A layer that
// registered without an outside test (e.g. a floating-ui dropdown, which
// dismisses itself) still counts as topmost, so a press that closes a dropdown
// never also closes the sheet or dialog under it.

import { useEffect, useRef, type RefObject } from "react";

type Layer = { id: number; close: () => void; isOutside?: (target: Node) => boolean };

const stack: Layer[] = [];
let nextId = 1;
let installed = false;
let pointerInstalled = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.close();
}

function onPointerDown(e: PointerEvent) {
  const top = stack[stack.length - 1];
  if (!top?.isOutside) return;
  const target = e.target;
  if (!(target instanceof Node) || !target.isConnected) return;
  // Not stopped: the press still reaches whatever was under it (e.g. another
  // button), the layer just closes first.
  if (top.isOutside(target)) top.close();
}

function install() {
  if (installed || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown, true);
  installed = true;
}

function installPointer() {
  if (pointerInstalled || typeof document === "undefined") return;
  document.addEventListener("pointerdown", onPointerDown, true);
  pointerInstalled = true;
}

/**
 * Register an open layer. Returns its unregister function. With `isOutside`,
 * a pointerdown for which it returns true closes the layer while it is topmost.
 */
export function pushEscapeLayer(close: () => void, isOutside?: (target: Node) => boolean): () => void {
  install();
  if (isOutside) installPointer();
  const layer: Layer = { id: nextId++, close, isOutside };
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
  if (pointerInstalled && typeof document !== "undefined") document.removeEventListener("pointerdown", onPointerDown, true);
  installed = false;
  pointerInstalled = false;
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

type DismissableOptions = {
  open: boolean;
  onClose: () => void;
  /**
   * Elements that count as inside the layer: the panel, and usually its
   * trigger (so pressing the trigger toggles instead of close-then-reopen).
   * Omit to close on Escape only.
   */
  inside?: RefObject<HTMLElement | null>[];
  /** Return focus to whatever had it when the layer opened. Default true. */
  restoreFocus?: boolean;
};

/**
 * Esc + click-outside + focus return for a popover, sheet or panel, in one
 * stack position. Escape and outside presses only ever close the topmost layer.
 */
export function useDismissableLayer({ open, onClose, inside, restoreFocus = true }: DismissableOptions): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const insideRef = useRef(inside);
  insideRef.current = inside;

  useEffect(() => {
    if (!open) return;
    const opener = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const isOutside = insideRef.current
      ? (target: Node) => !(insideRef.current ?? []).some((r) => r.current?.contains(target))
      : undefined;
    const pop = pushEscapeLayer(() => closeRef.current(), isOutside);
    return () => {
      pop();
      if (!restoreFocus || !opener || !opener.isConnected) return;
      // Only take focus back if it was left inside the closing layer or dropped
      // to <body>; a click that moved focus elsewhere wins.
      const active = document.activeElement;
      const lostInside =
        !active ||
        active === document.body ||
        (insideRef.current ?? []).some((r) => r.current?.contains(active));
      if (lostInside) opener.focus({ preventScroll: true });
    };
  }, [open, restoreFocus]);
}
