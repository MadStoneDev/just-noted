"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { MilkdownEditor } from "./editor/milkdown-editor";
import { useNotesStore } from "@/stores/notes-store";
import type { ContentFormat } from "@/types/combined-notes";

interface Props {
  noteId?: string;
  value: string;
  contentFormat?: ContentFormat;
  onChange?: (value: string) => void;
  placeholder?: string;
  distractionFreeMode?: boolean;
  className?: string;
  [key: string]: any;
}

export default function TextBlock({
  noteId,
  value,
  contentFormat = "html",
  onChange,
  placeholder = "Start typing...",
  distractionFreeMode = false,
  className = "",
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [localFormat, setLocalFormat] = useState<ContentFormat>(contentFormat);

  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExternalValueRef = useRef(value);
  const isInternalChangeRef = useRef(false);

  const isEditing = useNotesStore((state) =>
    noteId ? state.isEditing.has(noteId) : false,
  );

  const handleChange = useCallback(
    (newContent: string) => {
      isInternalChangeRef.current = true;

      setLocalValue(newContent);
      setLocalFormat("markdown");
      lastExternalValueRef.current = newContent;

      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }

      changeTimeoutRef.current = setTimeout(() => {
        onChange?.(newContent);
        isInternalChangeRef.current = false;
      }, 100);
    },
    [onChange],
  );

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
      distractionFreeMode ? "" : "min-h-[400px] max-h-[500px]"
    } h-full bg-[var(--color-bg-editor)] rounded-[var(--radius-lg)] overflow-hidden overflow-y-auto ${className}`;
  }, [distractionFreeMode, className]);

  return (
    <div className={editorContainerClass}>
      <MilkdownEditor
        content={localValue}
        contentFormat={localFormat}
        onChange={handleChange}
        placeholder={placeholder}
      />
    </div>
  );
}
