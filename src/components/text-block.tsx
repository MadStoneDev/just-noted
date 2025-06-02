"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import TipTapEditor from "./tip-tap-editor";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  onContentCapture?: () => string;
  placeholder?: string;
  className?: string;
  [key: string]: any;
}

interface TipTapEditorMethods {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

export default function TextBlock({
  value,
  onChange,
  onContentCapture,
  placeholder = "Start typing...",
  className = "",
  ...props
}: Props) {
  // States
  const [localValue, setLocalValue] = useState(value);
  const [isEditorReady, setIsEditorReady] = useState(false);

  // Refs
  const currentContentRef = useRef(value);
  const editorRef = useRef<TipTapEditorMethods>(null);
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPropsValueRef = useRef(value);

  // Optimized change handler with local state update
  const handleChange = useCallback(
    (newContent: string) => {
      // Update local state immediately for responsive UI
      setLocalValue(newContent);
      currentContentRef.current = newContent;

      // Clear existing timeout
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }

      // Debounce the parent onChange to reduce re-renders
      changeTimeoutRef.current = setTimeout(() => {
        if (onChange && newContent !== lastPropsValueRef.current) {
          onChange(newContent);
          lastPropsValueRef.current = newContent;
        }
      }, 300); // Shorter debounce for more responsive feel
    },
    [onChange],
  );

  // Handle editor ready state
  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true);
  }, []);

  // Only update local value if props value changes from external source
  useEffect(() => {
    if (
      value !== lastPropsValueRef.current &&
      value !== currentContentRef.current
    ) {
      setLocalValue(value);
      currentContentRef.current = value;
      lastPropsValueRef.current = value;

      // Update editor content if it's ready
      if (editorRef.current) {
        editorRef.current.setMarkdown(value);
      }
    }
  }, [value]);

  // Setup content capture
  useEffect(() => {
    if (onContentCapture) {
      // This allows parent to get the most recent content
      onContentCapture = () => currentContentRef.current;
    }
  }, [onContentCapture]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  // Check if content is empty
  const isEmpty = !localValue || localValue.trim() === "";

  // Custom styling for the editor container
  const editorContainerClass = useMemo(() => {
    return `tiptap-editor-container relative min-h-[400px] max-h-[500px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus-within:shadow-neutral-300 outline-2 outline-transparent focus-within:outline-mercedes-primary font-light overflow-hidden transition-all duration-300 ease-in-out ${className}`;
  }, [className]);

  return (
    <div className={editorContainerClass + `overflow-y-auto`}>
      <TipTapEditor
        ref={editorRef}
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
