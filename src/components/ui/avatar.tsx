import React from "react";

// Shared avatar. When there's no image, fall back to the JustNoted teal with the
// username's first letter in charcoal — consistent everywhere an avatar shows.
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
  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
  return (
    <span
      className={`rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, background: url ? undefined : "#0FB8B0" }}
      aria-label={name ?? undefined}
    >
      {url ? (
        <img src={url} alt={name ?? ""} className="w-full h-full object-cover" />
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
