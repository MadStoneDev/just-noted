"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import dynamic from "next/dynamic";

// Dynamic import to prevent SSR issues
const MDEditorComponent = dynamic(() => import("./md-editor-initialiser"), {
  ssr: false,
  loading: () => (
    <div className="editor-loading p-3 min-h-[400px] bg-white rounded-xl shadow-lg animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  ),
});

interface Props {
  value: string;
  onChange?: (value: string) => void;
  onContentCapture?: () => string;
  placeholder?: string;
  className?: string;
  [key: string]: any;
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
  const editorRef = useRef(null);
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPropsValueRef = useRef(value);

  // Memoize the editor configuration to prevent re-renders
  const editorConfig = useMemo(
    () => ({
      placeholder,
      className: `editor-content relative p-3 min-h-[400px] max-h-[500px] bg-white rounded-xl shadow-lg shadow-transparent hover:shadow-neutral-300 focus:shadow-neutral-300 outline-2 outline-transparent focus:outline-mercedes-primary font-light overflow-y-auto whitespace-pre-wrap ${className} transition-all duration-300 ease-in-out`,
      // Add performance optimizations
      options: {
        lineNumbers: false,
        lineWrapping: true,
        // Reduce re-parsing frequency
        viewportMargin: 100,
        // Optimize for long documents
        maxHighlightLength: 10000,
        // Reduce syntax highlighting overhead
        mode: "markdown",
        // Enable native spellcheck
        spellcheck: true,
        // Optimize input handling
        inputStyle: "contenteditable",
        // Reduce re-render frequency
        pollInterval: 100,
      },
    }),
    [placeholder, className],
  );

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

  return (
    <div className="text-editor-container">
      <MDEditorComponent
        editorRef={editorRef}
        markdown={isEmpty ? "" : localValue}
        onChange={handleChange}
        onReady={handleEditorReady}
        config={editorConfig}
        // Prevent unnecessary re-renders
        key="markdown-editor"
        {...props}
      />
      {!isEditorReady && (
        <div className="editor-overlay absolute inset-0 bg-white/50 pointer-events-none" />
      )}
    </div>
  );
}
