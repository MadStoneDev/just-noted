"use client";

import { useEffect } from "react";

/**
 * Stops the browser from navigating away to open a file when one is dropped
 * outside a real drop target (e.g. on the sidebar). The editor's own drop zone
 * handles file drops in the capture phase and stops propagation, so its drops
 * never reach these window-level listeners. Only acts on file drags, leaving
 * internal drag-and-drop (note/notebook reordering) untouched.
 */
export default function PreventFileDropNavigation() {
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");

    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return null;
}
