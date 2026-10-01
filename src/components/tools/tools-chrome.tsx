"use client";

import React from "react";
import ToolsTopBar from "@/components/tools/tools-top-bar";

// Tools shell: the 52px top bar above a scrollable content area. Wraps every
// Tools page (the grid and each tool) so the bar is consistent and the content
// sets its own centred column width inside.
export default function ToolsChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-[var(--color-canvas)]">
      <ToolsTopBar />
      <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
    </div>
  );
}
