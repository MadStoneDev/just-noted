"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import ReferenceNotePane from "./reference-note-pane";

interface SplitViewContainerProps {
  children: React.ReactNode;
}

export default function SplitViewContainer({ children }: SplitViewContainerProps) {
  const {
    splitViewEnabled,
    splitViewDirection,
    splitPaneSizes,
    setSplitPaneSizes,
    setSplitViewEnabled,
  } = useNotesStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ position: 0, sizes: splitPaneSizes });

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        position: splitViewDirection === "horizontal" ? e.clientX : e.clientY,
        sizes: [...splitPaneSizes] as [number, number],
      };
    },
    [splitViewDirection, splitPaneSizes]
  );

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerSize =
        splitViewDirection === "horizontal"
          ? containerRect.width
          : containerRect.height;

      const currentPosition =
        splitViewDirection === "horizontal" ? e.clientX : e.clientY;
      const startPosition = dragStartRef.current.position;
      const delta = currentPosition - startPosition;
      const deltaPercent = (delta / containerSize) * 100;

      const newMainSize = Math.min(
        Math.max(dragStartRef.current.sizes[0] + deltaPercent, 20),
        80
      );
      const newRefSize = 100 - newMainSize;

      setSplitPaneSizes([newMainSize, newRefSize]);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, splitViewDirection, setSplitPaneSizes]);

  // Handle close split view
  const handleCloseSplitView = useCallback(() => {
    setSplitViewEnabled(false);
  }, [setSplitViewEnabled]);

  // If split view is not enabled, just render children
  if (!splitViewEnabled) {
    return <>{children}</>;
  }

  const isHorizontal = splitViewDirection === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? "flex-row" : "flex-col"} h-full`}
      style={{ minHeight: "calc(100vh - 180px)" }}
    >
      {/* Main pane */}
      <div
        className="overflow-auto"
        style={{
          [isHorizontal ? "width" : "height"]: `${splitPaneSizes[0]}%`,
          flexShrink: 0,
        }}
      >
        {children}
      </div>

      {/* Resizer */}
      <div
        onMouseDown={handleDragStart}
        className={`
          ${isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"}
          bg-neutral-200 hover:bg-mercedes-primary/50 transition-colors
          flex-shrink-0 relative group
          ${isDragging ? "bg-mercedes-primary" : ""}
        `}
      >
        {/* Drag handle indicator */}
        <div
          className={`
            absolute ${isHorizontal ? "top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" : "left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2"}
            ${isHorizontal ? "w-1 h-8" : "h-1 w-8"}
            bg-neutral-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity
          `}
        />
      </div>

      {/* Reference pane */}
      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? "width" : "height"]: `${splitPaneSizes[1]}%`,
          flexShrink: 0,
        }}
      >
        <ReferenceNotePane onClose={handleCloseSplitView} />
      </div>
    </div>
  );
}
