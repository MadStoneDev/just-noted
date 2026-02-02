"use client";

import React, { useState, useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { buildHeadingTree, flattenHeadingTree, TocHeading } from "@/lib/toc-parser";
import { IconList, IconChevronDown } from "@tabler/icons-react";

interface TocCardProps {
  isPrivate: boolean;
  onScrollToHeading: (heading: TocHeading) => void;
  hasNotebookCover?: boolean;
}

export default function TocCard({ isPrivate, onScrollToHeading, hasNotebookCover }: TocCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { tocHeadings, activeHeadingId } = useNotesStore();

  // Build hierarchical tree for display
  const flatHeadings = useMemo(() => {
    const tree = buildHeadingTree(tocHeadings);
    return flattenHeadingTree(tree);
  }, [tocHeadings]);

  const hasHeadings = tocHeadings.length > 0;

  const handleToggle = () => {
    if (hasHeadings) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleHeadingClick = (heading: TocHeading) => {
    onScrollToHeading(heading);
  };

  return (
    <div
      className={`col-span-4 flex flex-col rounded-xl overflow-hidden transition-all duration-300 ${
        hasNotebookCover
          ? "bg-white/20 text-white"
          : isPrivate
            ? "bg-violet-100/80 text-violet-900"
            : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        disabled={!hasHeadings}
        className={`p-2.5 flex items-center justify-between gap-1 w-full text-left ${
          hasHeadings
            ? `cursor-pointer ${hasNotebookCover ? "hover:bg-white/10" : "hover:bg-black/5"}`
            : "cursor-default"
        } transition-colors`}
      >
        <div className="flex items-center gap-2">
          <IconList size={16} strokeWidth={2} className={hasNotebookCover ? "text-white/80" : isPrivate ? "text-violet-600" : "text-neutral-500"} />
          <span className="text-sm font-medium">Contents</span>
          {!hasHeadings && (
            <span className={`text-xs italic ${hasNotebookCover ? "text-white/60" : "text-neutral-400"}`}>(No headings found)</span>
          )}
        </div>
        {hasHeadings && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              hasNotebookCover
                ? "bg-white/30 text-white"
                : isPrivate
                  ? "bg-violet-200 text-violet-700"
                  : "bg-neutral-200 text-neutral-600"
            }`}>
              {tocHeadings.length}
            </span>
            <IconChevronDown
              size={14}
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        )}
      </button>

      {/* Expanded headings list */}
      {isExpanded && hasHeadings && (
        <div className={`border-t max-h-48 overflow-y-auto ${hasNotebookCover ? "border-white/20" : "border-black/10"}`}>
          {flatHeadings.map((heading) => {
            const paddingLeft = 12 + heading.depth * 12;
            const isActive = heading.id === activeHeadingId;

            return (
              <button
                key={heading.id}
                onClick={() => handleHeadingClick(heading)}
                className={`w-full text-left py-1.5 px-2 text-xs transition-colors ${
                  isActive
                    ? hasNotebookCover
                      ? "bg-white/30 font-medium"
                      : isPrivate
                        ? "bg-violet-200/70 font-medium"
                        : "bg-mercedes-primary/20 font-medium"
                    : hasNotebookCover
                      ? "hover:bg-white/10"
                      : "hover:bg-black/5"
                }`}
                style={{ paddingLeft }}
                title={heading.text}
              >
                <span className="line-clamp-1">{heading.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
