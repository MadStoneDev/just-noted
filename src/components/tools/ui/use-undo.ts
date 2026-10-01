"use client";

import { useCallback, useRef, useState } from "react";

// Per-tool undo/redo stack (spec §5.2): up to 50 steps; a transform pushes one
// step unless it changed nothing; typing is grouped into one step per pause
// longer than 1s. The consumer wires ⌘Z / ⇧⌘Z to undo()/redo().

const LIMIT = 50;
const TYPING_GROUP_MS = 1000;

export function useUndo(initial: string) {
  const [value, setValue] = useState(initial);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastTypeAt = useRef<number>(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const push = (prev: string) => {
    past.current.push(prev);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
  };

  // A discrete change (a transform). One undo step; no-ops don't push.
  const apply = useCallback((next: string) => {
    setValue((cur) => {
      if (next === cur) return cur;
      push(cur);
      lastTypeAt.current = 0; // a transform ends any typing group
      rerender();
      return next;
    });
  }, []);

  // Typing: group edits within 1s into a single step.
  const type = useCallback((next: string) => {
    setValue((cur) => {
      if (next === cur) return cur;
      const now = Date.now();
      if (now - lastTypeAt.current > TYPING_GROUP_MS) push(cur);
      lastTypeAt.current = now;
      rerender();
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setValue((cur) => {
      if (past.current.length === 0) return cur;
      const prev = past.current.pop() as string;
      future.current.unshift(cur);
      lastTypeAt.current = 0;
      rerender();
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setValue((cur) => {
      if (future.current.length === 0) return cur;
      const next = future.current.shift() as string;
      past.current.push(cur);
      lastTypeAt.current = 0;
      rerender();
      return next;
    });
  }, []);

  const reset = useCallback((next: string) => {
    past.current = [];
    future.current = [];
    lastTypeAt.current = 0;
    setValue(next);
  }, []);

  return {
    value,
    apply,
    type,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
