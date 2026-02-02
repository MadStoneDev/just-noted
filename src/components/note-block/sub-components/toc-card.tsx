"use client";

import React, { useState, useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { buildHeadingTree, flattenHeadingTree, TocHeading } from "@/lib/toc-parser";
import { IconList, IconChevronDown } from "@tabler/icons-react";

interface TocCardProps {
  isPrivate: boolean;
  onScrollToHeading: (heading: TocHeading) => void;
}

export default function TocCard({ isPrivate, onScrollToHeading }: TocCardProps) {
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
      className={`col-span-2 sm:col-span-1 flex flex-col rounded-xl overflow-hidden transition-all duration-300 ${
        isPrivate
          ? "bg-violet-800/20 text-violet-900"
          : "bg-neutral-400/50 text-neutral-600"
      }`}
    >
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        disabled={!hasHeadings}
        className={`p-2 flex items-center justify-between gap-1 w-full text-left ${
          hasHeadings
            ? "cursor-pointer hover:bg-black/5"
            : "cursor-default opacity-60"
        } transition-colors`}
      >
        <div className="flex items-center gap-1.5">
          <IconList size={14} strokeWidth={2} />
          <span className="text-xs font-medium">Contents</span>
        </div>
        {hasHeadings && (
          <div className="flex items-center gap-1">
            <span className="text-xs opacity-70">{tocHeadings.length}</span>
            <IconChevronDown
              size={14}
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        )}
      </button>

      {/* Expanded headings list */}
      {isExpanded && hasHeadings && (
        <div className="border-t border-black/10 max-h-48 overflow-y-auto">
          {flatHeadings.map((heading) => {
            const paddingLeft = 8 + heading.depth * 10;
            const isActive = heading.id === activeHeadingId;

            return (
              <button
                key={heading.id}
                onClick={() => handleHeadingClick(heading)}
                className={`w-full text-left py-1.5 px-2 text-xs transition-colors ${
                  isActive
                    ? isPrivate
                      ? "bg-violet-800/30 font-medium"
                      : "bg-mercedes-primary/20 font-medium"
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

      {/* Empty state when expanded but no headings */}
      {isExpanded && !hasHeadings && (
        <div className="p-2 border-t border-black/10 text-xs opacity-60 text-center">
          Add headings to see them here
        </div>
      )}
    </div>
  );
}
