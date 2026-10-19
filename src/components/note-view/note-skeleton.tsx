import React from "react";

// Loading skeleton for a note's body (and optionally its title), sized to the
// content column. Used while a shared note is fetching and while its editor is
// still mounting/loading, so we never flash an empty "Start writing…" editor or
// a "Connecting…" message before the content is ready.
export function NoteSkeleton({ withTitle = false }: { withTitle?: boolean }) {
  return (
    <div
      className="mx-auto w-full max-w-[var(--content-width)] px-4 md:px-8 py-8"
      aria-hidden
    >
      {/* animate-pulse rather than the global .skeleton shimmer: that gradient's
          two stops are the same colour in dark mode, so it looks frozen. */}
      {withTitle && (
        <div className="h-10 w-2/3 rounded-[var(--radius-6)] mb-6 bg-[var(--color-raised-soft)] animate-pulse" />
      )}
      <div className="space-y-3">
        {["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6", "w-2/3"].map((w, i) => (
          <div
            key={i}
            className={`h-4 ${w} rounded bg-[var(--color-raised-soft)] animate-pulse`}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default NoteSkeleton;
