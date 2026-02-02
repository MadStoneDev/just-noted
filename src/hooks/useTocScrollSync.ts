import { useEffect, useCallback, useRef, RefObject } from "react";
import { TocHeading } from "@/lib/toc-parser";
import { useNotesStore } from "@/stores/notes-store";

interface UseTocScrollSyncOptions {
  offset?: number; // Pixels from top to consider "active"
  debounceMs?: number;
}

/**
 * Find heading element in the editor by matching text and level
 */
function findHeadingInEditor(
  container: HTMLElement,
  headingText: string,
  headingLevel: number
): HTMLElement | null {
  // Look for headings in the ProseMirror editor
  const proseMirror = container.querySelector(".ProseMirror");
  const searchContainer = proseMirror || container;

  const selector = `h${headingLevel}`;
  const headings = searchContainer.querySelectorAll(selector);

  for (const el of headings) {
    const text = el.textContent?.trim() || "";
    if (text === headingText) {
      return el as HTMLElement;
    }
  }

  // Fallback: partial match
  for (const el of headings) {
    const text = el.textContent?.trim() || "";
    if (text.includes(headingText) || headingText.includes(text)) {
      return el as HTMLElement;
    }
  }

  return null;
}

/**
 * Hook to synchronize ToC with editor scroll position
 */
export function useTocScrollSync(
  editorRef: RefObject<HTMLElement | null>,
  options: UseTocScrollSyncOptions = {}
) {
  const { offset = 100, debounceMs = 50 } = options;

  const { tocHeadings, setActiveHeadingId, tocVisible, activeNoteId } = useNotesStore();
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get the editor container for the active note
  const getEditorContainer = useCallback((): HTMLElement | null => {
    if (editorRef.current) {
      return editorRef.current;
    }

    // Fallback: find by active note ID
    if (activeNoteId) {
      const noteSection = document.querySelector(`[data-note-id="${activeNoteId}"]`);
      if (noteSection) {
        const editorContainer = noteSection.querySelector('.tiptap-editor-container');
        return editorContainer as HTMLElement | null;
      }
    }

    return null;
  }, [editorRef, activeNoteId]);

  // Find which heading is currently in view
  const updateActiveHeading = useCallback(() => {
    const container = getEditorContainer();
    if (!container || tocHeadings.length === 0 || !tocVisible) return;

    let activeHeading: TocHeading | null = null;

    // Find the last heading that is above the offset threshold
    for (const heading of tocHeadings) {
      const element = findHeadingInEditor(
        container,
        heading.text,
        heading.level
      );

      if (element) {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;

        if (relativeTop <= offset) {
          activeHeading = heading;
        } else {
          break;
        }
      }
    }

    const newActiveId = activeHeading?.id || tocHeadings[0]?.id || null;
    setActiveHeadingId(newActiveId);
  }, [getEditorContainer, tocHeadings, offset, tocVisible, setActiveHeadingId]);

  // Debounced scroll handler
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      updateActiveHeading();
    }, debounceMs);
  }, [updateActiveHeading, debounceMs]);

  // Set up scroll listener
  useEffect(() => {
    const container = getEditorContainer();
    if (!container || !tocVisible) return;

    // Listen to scroll on the editor container
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Initial check
    updateActiveHeading();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [getEditorContainer, handleScroll, updateActiveHeading, tocVisible]);

  // Scroll to a specific heading
  const scrollToHeading = useCallback(
    (headingId: string) => {
      const container = getEditorContainer();
      if (!container) return;

      const heading = tocHeadings.find((h) => h.id === headingId);
      if (!heading) return;

      const element = findHeadingInEditor(
        container,
        heading.text,
        heading.level
      );

      if (element) {
        // Scroll the element into view
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        // Update active heading after scroll
        setTimeout(() => {
          setActiveHeadingId(headingId);
        }, 100);
      }
    },
    [getEditorContainer, tocHeadings, setActiveHeadingId]
  );

  return {
    scrollToHeading,
    updateActiveHeading,
  };
}
