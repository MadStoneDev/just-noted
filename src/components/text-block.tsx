"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import TipTapEditor from "./tip-tap-editor";
import { useNotesStore } from "@/stores/notes-store";

interface Props {
  noteId?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  distractionFreeMode?: boolean;
  className?: string;
  [key: string]: any;
}

export default function TextBlock({
  noteId,
  value,
  onChange,
  placeholder = "Start typing...",
  distractionFreeMode = false,
  className = "",
  ...props
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const editorRef = useRef<any>(null);
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastExternalValueRef = useRef(value);
  const isInternalChangeRef = useRef(false);

  // Check if this note is being edited - if so, don't sync external changes
  const isEditing = useNotesStore((state) =>
    noteId ? state.isEditing.has(noteId) : false
  );

  // Stable change handler - only recreate if onChange changes
  const handleChange = useCallback(
    (newContent: string) => {
      // Mark as internal change to avoid circular updates
      isInternalChangeRef.current = true;

      setLocalValue(newContent);
      lastExternalValueRef.current = newContent;

      // Clear existing timeout
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }

      // Debounce external onChange to reduce parent re-renders
      changeTimeoutRef.current = setTimeout(() => {
        if (onChange) {
          onChange(newContent);
        }
        isInternalChangeRef.current = false;
      }, 100);
    },
    [onChange],
  );

  // Only update if external value changed AND user is not currently editing
  useEffect(() => {
    // Don't sync external changes while user is editing
    if (isEditing || isInternalChangeRef.current) {
      return;
    }

    if (value !== lastExternalValueRef.current) {
      setLocalValue(value);
      lastExternalValueRef.current = value;

      // Let TipTapEditor handle its own content update via props
      // Don't call setMarkdown directly as it can cause issues
    }
  }, [value, isEditing]);

  // Memoize editor ready handler
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

  // Memoize container class
  const editorContainerClass = useMemo(() => {
    return `tiptap-editor-container relative pb-1 ${
      distractionFreeMode ? "" : "min-h-[400px] max-h-[500px]"
    } h-full bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus-within:shadow-neutral-300 outline-2 outline-transparent focus-within:outline-mercedes-primary font-light overflow-hidden transition-all duration-300 ease-in-out overflow-y-auto ${className}`;
  }, [distractionFreeMode, className]);

  const isEmpty = !localValue || localValue.trim() === "";

  return (
    <div className={editorContainerClass}>
      <TipTapEditor
        ref={editorRef}
        noteId={noteId}
        markdown={isEmpty ? "" : localValue}
        onChange={handleChange}
        onReady={handleEditorReady}
        placeholder={placeholder}
        {...props}
      />
      {!isEditorReady && (
        <div className="absolute inset-0 bg-white/50 pointer-events-none flex items-center justify-center">
          <div className="animate-pulse text-neutral-500">
            Loading editor...
          </div>
        </div>
      )}
    </div>
  );
}
