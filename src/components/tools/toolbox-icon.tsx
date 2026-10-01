import React from "react";

// Tools rail icon — the toolbox from spec §2.2 (not a wrench):
// rect(2.5, 6.5, 14×9.5, r2), handle M7 6.5V4.5h5v2, belt line at y=10.5.
export default function ToolboxIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 19 19"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6.5" width="14" height="9.5" rx="2" />
      <path d="M7 6.5V4.5h5v2" />
      <line x1="2.5" y1="10.5" x2="16.5" y2="10.5" />
    </svg>
  );
}
