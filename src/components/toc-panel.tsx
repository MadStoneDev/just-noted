"use client";

import React, { useMemo, useEffect, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { buildHeadingTree, flattenHeadingTree, TocHeading } from "@/lib/toc-parser";
import {
  IconList,
  IconX,
  IconChevronRight,
  IconChevronDown,
} from "@tabler/icons-react";

interface TocPanelProps {
  onScrollToHeading: (headingId: string) => void;
}

export default function TocPanel({ onScrollToHeading }: TocPanelProps) {
  const { tocVisible, tocHeadings, activeHeadingId, setTocVisible } = useNotesStore();

  // Build hierarchical tree for display
  const flatHeadings = useMemo(() => {
    const tree = buildHeadingTree(tocHeadings);
    return flattenHeadingTree(tree);
  }, [tocHeadings]);

  const handleClose = useCallback(() => {
    setTocVisible(false);
  }, [setTocVisible]);

  // Handle click outside on mobile to close
  const handleBackdropClick = useCallback(() => {
    setTocVisible(false);
  }, [setTocVisible]);

  const handleHeadingClick = (heading: TocHeading) => {
    onScrollToHeading(heading.id);
    // Close on mobile after selecting
    if (window.innerWidth < 640) {
      setTocVisible(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tocVisible) {
        setTocVisible(false);
      }
    };

    if (tocVisible) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tocVisible, setTocVisible]);

  if (!tocVisible) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 sm:hidden"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* TOC Panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-64 sm:relative sm:inset-auto z-50 sm:z-auto border-l border-neutral-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <IconList size={16} />
            <span>Table of Contents</span>
          </div>
          <button
            onClick={handleClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-neutral-200 text-neutral-500 hover:text-neutral-700 transition-colors"
            title="Close"
            aria-label="Close table of contents"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {flatHeadings.length === 0 ? (
            <EmptyState />
          ) : (
            <nav className="px-2">
              {flatHeadings.map((heading) => (
                <TocItem
                  key={heading.id}
                  heading={heading}
                  depth={heading.depth}
                  isActive={heading.id === activeHeadingId}
                  onClick={() => handleHeadingClick(heading)}
                />
              ))}
            </nav>
          )}
        </div>
      </div>
    </>
  );
}

interface TocItemProps {
  heading: TocHeading & { depth: number };
  depth: number;
  isActive: boolean;
  onClick: () => void;
}

function TocItem({ heading, depth, isActive, onClick }: TocItemProps) {
  const paddingLeft = 8 + depth * 12; // Base padding + indent per level

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left py-2.5 px-2 min-h-[44px] rounded-lg text-sm transition-colors
        ${isActive
          ? "bg-mercedes-primary/10 text-mercedes-primary font-medium"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
        }
      `}
      style={{ paddingLeft }}
      title={heading.text}
    >
      <span className="line-clamp-2">{heading.text}</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
        <IconList size={24} className="text-neutral-400" />
      </div>
      <p className="text-sm text-neutral-500 mb-1">No headings found</p>
      <p className="text-xs text-neutral-400">
        Add headings (H1, H2, H3...) to your note to see them here
      </p>
    </div>
  );
}

// Compact toggle button for toolbar
export function TocToggleButton() {
  const { tocVisible, toggleToc, tocHeadings } = useNotesStore();
  const hasHeadings = tocHeadings.length > 0;

  return (
    <button
      type="button"
      onClick={toggleToc}
      title={tocVisible ? "Hide Table of Contents" : "Show Table of Contents"}
      aria-label={tocVisible ? "Hide Table of Contents" : "Show Table of Contents"}
      className={`group/toc px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-[44px] h-[44px] rounded-lg border-1 relative ${
        tocVisible
          ? "border-mercedes-primary bg-mercedes-primary text-white"
          : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary text-neutral-800"
      } overflow-hidden transition-all duration-300 ease-in-out`}
    >
      <IconList size={20} strokeWidth={2} />
      <span
        className={`w-fit max-w-0 sm:group-hover/toc:max-w-52 opacity-0 md:group-hover/toc:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap`}
      >
        Contents
      </span>
      {hasHeadings && !tocVisible && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-mercedes-primary rounded-full border-2 border-white" />
      )}
    </button>
  );
}
