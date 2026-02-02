"use client";

import React, { useRef, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import TocPanel from "./toc-panel";
import { useTocScrollSync } from "@/hooks/useTocScrollSync";

interface RightSidebarProps {
  editorContainerRef?: React.RefObject<HTMLElement | null>;
}

export default function RightSidebar({ editorContainerRef }: RightSidebarProps) {
  const { tocVisible, activeNoteId } = useNotesStore();

  // Create a fallback ref if none provided
  const fallbackRef = useRef<HTMLElement | null>(null);
  const containerRef = editorContainerRef || fallbackRef;

  // Use the scroll sync hook
  const { scrollToHeading } = useTocScrollSync(containerRef);

  // Handle heading click - scroll to heading in editor
  const handleScrollToHeading = useCallback(
    (headingId: string) => {
      // First, try to find the active note's editor container
      if (activeNoteId) {
        const noteSection = document.querySelector(`[data-note-id="${activeNoteId}"]`);
        if (noteSection) {
          const editorContainer = noteSection.querySelector('.tiptap-editor-container');
          if (editorContainer) {
            // Update the fallback ref to point to the editor
            fallbackRef.current = editorContainer as HTMLElement;
          }
        }
      }

      scrollToHeading(headingId);
    },
    [activeNoteId, scrollToHeading]
  );

  // Don't render if ToC is not visible
  if (!tocVisible) {
    return null;
  }

  return (
    <aside
      className="fixed right-0 top-32 bottom-0 z-40 transition-transform duration-300 ease-in-out"
      style={{
        transform: tocVisible ? "translateX(0)" : "translateX(100%)",
      }}
    >
      <TocPanel onScrollToHeading={handleScrollToHeading} />
    </aside>
  );
}
