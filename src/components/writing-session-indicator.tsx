"use client";

import React from "react";
import { useWritingSession } from "@/hooks/use-writing-session";
import { IconFlame, IconPencil } from "@tabler/icons-react";

function formatDuration(seconds: number): string {
  if (seconds < 60) return "<1m";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export default function WritingSessionIndicator() {
  const { sessionWordCount, streak, sessionDuration } = useWritingSession();

  return (
    <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
      {sessionWordCount > 0 && (
        <span className="flex items-center gap-1" title="Words written this session">
          <IconPencil size={11} />
          {sessionWordCount.toLocaleString()}w
        </span>
      )}
      {streak > 0 && (
        <span
          className="flex items-center gap-0.5"
          title={`${streak} day writing streak`}
        >
          <IconFlame size={11} className="text-orange-400" />
          {streak}d
        </span>
      )}
      <span title="Time in this writing session (resets after 30 min idle)">
        {formatDuration(sessionDuration)}
      </span>
    </div>
  );
}
