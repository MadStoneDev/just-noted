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
      {withTitle && <div className="skeleton h-10 w-2/3 rounded-[var(--radius-6)] mb-6" />}
      <div className="space-y-3">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-11/12 rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
      </div>
    </div>
  );
}

export default NoteSkeleton;
