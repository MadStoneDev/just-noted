"use client";

import React, { createContext, useState } from "react";
import ToolsTopBar from "@/components/tools/tools-top-bar";

// Portal target for a tool's mobile action bar. A tool (e.g. the case
// converter) renders its sticky bar into this node so the bar is a real
// flex-none child BELOW the scroll area — the scroll container ends at the
// bar's top edge and nothing (footer, scrollbar) can sit behind it (§9.5).
export const ToolsBottomBarContext = createContext<HTMLElement | null>(null);

// Tools shell: the 52px top bar above a scrollable content area. Wraps every
// Tools page (the grid and each tool) so the bar is consistent and the content
// sets its own centred column width inside.
export default function ToolsChrome({ children }: { children: React.ReactNode }) {
  const [barNode, setBarNode] = useState<HTMLDivElement | null>(null);
  return (
    <ToolsBottomBarContext.Provider value={barNode}>
      <div className="flex flex-col h-full bg-[var(--color-canvas)]">
        <ToolsTopBar />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">{children}</div>
        {/* Tool mobile action bar lands here (in-flow, below the scroll area).
            Empty and 0px tall until a tool portals its bar in. */}
        <div ref={setBarNode} className="flex-none" />
      </div>
    </ToolsBottomBarContext.Provider>
  );
}
