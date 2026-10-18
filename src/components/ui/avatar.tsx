"use client";

import React, { useState } from "react";

// Shared avatar. When there's no image — or the image fails to load (404,
// deleted storage object, auth-gated URL) — fall back to the JustNoted teal
// with the username's first letter in charcoal, consistent everywhere an
// avatar shows. The failure is tracked per-URL so a different owner's avatar
// is still attempted rather than inheriting a previous one's failure.
export function Avatar({
  url,
  name,
  size = 32,
  className = "",
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
  const showImg = !!url && failedUrl !== url;
  return (
    <span
      className={`rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, background: showImg ? undefined : "#0FB8B0" }}
      aria-label={name ?? undefined}
    >
      {showImg ? (
        <img
          src={url ?? undefined}
          alt={name ?? ""}
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(url ?? null)}
        />
      ) : (
        <span
          style={{
            color: "#0A0C0C",
            fontSize: Math.max(10, Math.round(size * 0.44)),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

export default Avatar;
