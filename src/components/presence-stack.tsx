"use client";

import React from "react";
import type { PresenceUser } from "@/hooks/use-presence";

function idleLabel(u: PresenceUser): string {
  const ms = Date.now() - u.lastActive;
  if (ms < 30000) return "editing now";
  const m = Math.max(1, Math.round(ms / 60000));
  return `idle ${m}m`;
}

/**
 * Overlapping presence avatars (design surface 05): up to three 26px avatars,
 * then a +n chip. Idle members (no heartbeat in 30s) fade rather than vanish.
 * The ring colour matches the banner it sits in.
 */
export function PresenceStack({
  users,
  max = 3,
  ringColor = "var(--color-accent-tint)",
}: {
  users: PresenceUser[];
  max?: number;
  ringColor?: string;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {shown.map((u, i) => {
          const idle = Date.now() - u.lastActive >= 30000;
          return (
            <span
              key={u.userId}
              title={`@${u.handle} · ${idleLabel(u)}${u.self ? " (you)" : ""}`}
              className="relative w-[26px] h-[26px] rounded-full overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white transition-opacity"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                zIndex: max - i,
                backgroundColor: u.color,
                boxShadow: `0 0 0 2px ${ringColor}`,
                opacity: idle ? 0.45 : 1,
              }}
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (u.handle || "?").charAt(0).toUpperCase()
              )}
            </span>
          );
        })}
      </div>
      {extra > 0 && (
        <span
          className="ml-1 h-[20px] px-1.5 flex items-center rounded-full text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-3)] bg-[var(--color-raised-soft)]"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
