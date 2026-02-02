"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconChevronDown,
  IconCheck,
  IconLock,
  IconLockOpen,
} from "@tabler/icons-react";

export default function SplitViewButton() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    splitViewEnabled,
    toggleSplitView,
    splitViewDirection,
    setSplitViewDirection,
    referenceNoteEditable,
    setReferenceNoteEditable,
  } = useNotesStore();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    toggleSplitView();
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Split view"
        className={`group/split px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
          splitViewEnabled
            ? "border-mercedes-primary bg-mercedes-primary text-white"
            : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary text-neutral-800"
        } overflow-hidden transition-all duration-300 ease-in-out`}
      >
        {splitViewDirection === "horizontal" ? (
          <IconLayoutColumns size={20} strokeWidth={2} />
        ) : (
          <IconLayoutRows size={20} strokeWidth={2} />
        )}
        <IconChevronDown
          size={14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[180px] z-50">
          {/* Toggle split view */}
          <button
            onClick={handleToggle}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors text-left"
          >
            <span className="flex-1 text-sm">
              {splitViewEnabled ? "Close Split View" : "Open Split View"}
            </span>
            {splitViewEnabled && (
              <IconCheck size={16} className="text-mercedes-primary" />
            )}
          </button>

          <div className="border-t border-neutral-100 my-1" />

          {/* Direction options */}
          <div className="px-3 py-1 text-xs text-neutral-500 font-medium">
            Layout
          </div>

          <button
            onClick={() => {
              setSplitViewDirection("horizontal");
              if (!splitViewEnabled) toggleSplitView();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            <IconLayoutColumns size={16} className="text-neutral-500" />
            <span className="flex-1 text-sm">Side by Side</span>
            {splitViewDirection === "horizontal" && (
              <IconCheck size={14} className="text-mercedes-primary" />
            )}
          </button>

          <button
            onClick={() => {
              setSplitViewDirection("vertical");
              if (!splitViewEnabled) toggleSplitView();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            <IconLayoutRows size={16} className="text-neutral-500" />
            <span className="flex-1 text-sm">Top & Bottom</span>
            {splitViewDirection === "vertical" && (
              <IconCheck size={14} className="text-mercedes-primary" />
            )}
          </button>

          <div className="border-t border-neutral-100 my-1" />

          {/* Editable toggle */}
          <button
            onClick={() => setReferenceNoteEditable(!referenceNoteEditable)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            {referenceNoteEditable ? (
              <IconLockOpen size={16} className="text-neutral-500" />
            ) : (
              <IconLock size={16} className="text-neutral-500" />
            )}
            <span className="flex-1 text-sm">Editable Reference</span>
            {referenceNoteEditable && (
              <IconCheck size={14} className="text-mercedes-primary" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// Compact button for areas with less space
export function SplitViewToggle() {
  const { splitViewEnabled, toggleSplitView, splitViewDirection } = useNotesStore();

  return (
    <button
      type="button"
      onClick={toggleSplitView}
      title={splitViewEnabled ? "Close split view (Ctrl+Shift+S)" : "Open split view (Ctrl+Shift+S)"}
      className={`p-2 rounded-lg transition-colors ${
        splitViewEnabled
          ? "bg-mercedes-primary/10 text-mercedes-primary"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
      }`}
    >
      {splitViewDirection === "horizontal" ? (
        <IconLayoutColumns size={18} />
      ) : (
        <IconLayoutRows size={18} />
      )}
    </button>
  );
}
