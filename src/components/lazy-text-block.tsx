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
import { SkeletonText } from "@/components/ds/skeleton";
import type { ContentFormat } from "@/types/combined-notes";

const MilkdownEditor = lazy(() => import("./editor/milkdown-editor"));

interface Props {
  noteId?: string;
  value: string;
  contentFormat?: ContentFormat;
  onChange?: (value: string) => void;
  placeholder?: string;
  distractionFreeMode?: boolean;
  className?: string;
  isCollapsed?: boolean;
  [key: string]: any;
}

function ContentPreview({
  content,
  contentFormat = "html",
  className,
}: {
  content: string;
  contentFormat?: ContentFormat;
  className?: string;
}) {
  const previewText = useMemo(() => {
    return getPlainTextPreview(content, 200, contentFormat);
  }, [content, contentFormat]);

  if (!previewText.trim()) {
    return (
      <div
        className={`p-4 text-[var(--color-text-tertiary)] italic text-sm ${className}`}
      >
        Empty note - click to expand
      </div>
    );
  }

  return (
    <div
      className={`p-4 text-[var(--color-text-secondary)] line-clamp-2 text-sm leading-relaxed ${className}`}
    >
      {previewText}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="p-4">
      <SkeletonText lines={4} />
    </div>
  );
}

export default function LazyTextBlock({
  noteId,
  value,
  contentFormat = "html",
  onChange,
  placeholder = "Start typing...",
  distractionFreeMode = false,
  className = "",
  isCollapsed = false,
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [localFormat, setLocalFormat] = useState<ContentFormat>(contentFormat);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(!isCollapsed);

  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExternalValueRef = useRef(value);
  const isInternalChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);

  const isEditing = useNotesStore((state) =>
    noteId ? state.isEditing.has(noteId) : false,
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isCollapsed && !hasBeenExpanded) {
      setHasBeenExpanded(true);
    }
  }, [isCollapsed, hasBeenExpanded]);

  const handleChange = useCallback((newContent: string) => {
    isInternalChangeRef.current = true;

    setLocalValue(newContent);
    setLocalFormat("markdown");
    lastExternalValueRef.current = newContent;

    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
    }

    changeTimeoutRef.current = setTimeout(() => {
      onChangeRef.current?.(newContent);
      isInternalChangeRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (isEditing || isInternalChangeRef.current) return;

    if (value !== lastExternalValueRef.current) {
      setLocalValue(value);
      setLocalFormat(contentFormat);
      lastExternalValueRef.current = value;
    }
  }, [value, contentFormat, isEditing]);

  useEffect(() => {
    return () => {
      if (changeTimeoutRef.current) clearTimeout(changeTimeoutRef.current);
    };
  }, []);

  const editorContainerClass = useMemo(() => {
    return `relative ${
      distractionFreeMode ? "" : "min-h-[300px] md:min-h-[400px] max-h-[500px]"
    } h-full bg-transparent rounded-[var(--radius-lg)] overflow-hidden overflow-y-auto ${className}`;
  }, [distractionFreeMode, className]);

  if (isCollapsed && !hasBeenExpanded) {
    return (
      <div className={`relative bg-transparent rounded-[var(--radius-lg)] overflow-hidden ${className}`}>
        <ContentPreview content={localValue} contentFormat={localFormat} />
      </div>
    );
  }

  return (
    <div
      className={editorContainerClass}
      style={{ display: isCollapsed ? "none" : "block" }}
    >
      <Suspense fallback={<EditorSkeleton />}>
        <MilkdownEditor
          content={localValue}
          contentFormat={localFormat}
          onChange={handleChange}
          placeholder={placeholder}
        />
      </Suspense>
    </div>
  );
}
