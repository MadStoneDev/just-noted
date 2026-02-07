"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  Suspense,
  lazy,
} from "react";
import { useNotesStore } from "@/stores/notes-store";
import { getPlainTextPreview } from "@/utils/html-utils";

// Lazy load TipTapEditor - only loads when actually needed
const TipTapEditor = lazy(() => import("./tip-tap-editor"));

interface Props {
  noteId?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  distractionFreeMode?: boolean;
  className?: string;
  isCollapsed?: boolean;
  [key: string]: any;
}

// Simple content preview for collapsed notes (no TipTap overhead)
function ContentPreview({ content, className }: { content: string; className?: string }) {
  const previewText = useMemo(() => {
    return getPlainTextPreview(content, 200);
  }, [content]);

  if (!previewText.trim()) {
    return (
      <div className={`p-4 text-neutral-400/70 italic text-sm ${className}`}>
        Empty note - click to expand
      </div>
    );
  }

  return (
    <div className={`p-4 text-neutral-500 line-clamp-2 text-sm leading-relaxed ${className}`}>
      {previewText}
    </div>
  );
}

// Loading placeholder for editor
function EditorSkeleton() {
  return (
    <div className="animate-pulse p-4 space-y-3">
      <div className="h-4 bg-stone-200/60 rounded-md w-3/4"></div>
      <div className="h-4 bg-stone-200/60 rounded-md w-full"></div>
      <div className="h-4 bg-stone-200/60 rounded-md w-5/6"></div>
      <div className="h-4 bg-stone-200/60 rounded-md w-2/3"></div>
    </div>
  );
}

export default function LazyTextBlock({
  noteId,
  value,
  onChange,
  placeholder = "Start typing...",
  distractionFreeMode = false,
  className = "",
  isCollapsed = false,
  ...props
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(!isCollapsed);

  const editorRef = useRef<any>(null);
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastExternalValueRef = useRef(value);
  const isInternalChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);

  // Check if this note is being edited
  const isEditing = useNotesStore((state) =>
    noteId ? state.isEditing.has(noteId) : false
  );

  // Keep onChange ref in sync to avoid stale closures
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track if note has ever been expanded (to keep editor loaded)
  useEffect(() => {
    if (!isCollapsed && !hasBeenExpanded) {
      setHasBeenExpanded(true);
    }
  }, [isCollapsed, hasBeenExpanded]);

  // Stable change handler — uses ref to avoid stale closure
  const handleChange = useCallback(
    (newContent: string) => {
      isInternalChangeRef.current = true;

      setLocalValue(newContent);
      lastExternalValueRef.current = newContent;

      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }

      changeTimeoutRef.current = setTimeout(() => {
        if (onChangeRef.current) {
          onChangeRef.current(newContent);
        }
        isInternalChangeRef.current = false;
      }, 100);
    },
    []
  );

  // Sync external value changes
  useEffect(() => {
    if (isEditing || isInternalChangeRef.current) {
      return;
    }

    if (value !== lastExternalValueRef.current) {
      setLocalValue(value);
      lastExternalValueRef.current = value;
    }
  }, [value, isEditing]);

  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  // Container class
  const editorContainerClass = useMemo(() => {
    return `tiptap-editor-container relative pb-1 ${
      distractionFreeMode ? "" : "min-h-[400px] max-h-[500px]"
    } h-full bg-transparent rounded-xl focus-within:ring-1 focus-within:ring-mercedes-primary/30 font-light overflow-hidden transition-all duration-300 ease-in-out overflow-y-auto ${className}`;
  }, [distractionFreeMode, className]);

  const previewContainerClass = useMemo(() => {
    return `relative bg-transparent rounded-xl font-light overflow-hidden transition-all duration-300 ease-in-out ${className}`;
  }, [className]);

  const isEmpty = !localValue || localValue.trim() === "";

  // For collapsed notes that have never been expanded, show preview only
  if (isCollapsed && !hasBeenExpanded) {
    return (
      <div className={previewContainerClass}>
        <ContentPreview content={localValue} />
      </div>
    );
  }

  // Once expanded, always render the editor (but hide when collapsed)
  return (
    <div className={editorContainerClass} style={{ display: isCollapsed ? "none" : "block" }}>
      <Suspense fallback={<EditorSkeleton />}>
        <TipTapEditor
          ref={editorRef}
          noteId={noteId}
          markdown={isEmpty ? "" : localValue}
          onChange={handleChange}
          onReady={handleEditorReady}
          placeholder={placeholder}
          {...props}
        />
      </Suspense>
      {!isEditorReady && (
        <div className="absolute inset-0 bg-white pointer-events-none z-10">
          <EditorSkeleton />
        </div>
      )}
    </div>
  );
}
