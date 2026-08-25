"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getSharedWithMe,
  getSharedByMe,
  type SharedListItem,
} from "@/app/actions/sharing";
import {
  IconLoader2,
  IconWorld,
  IconLock,
  IconEye,
  IconUser,
  IconShare2,
} from "@tabler/icons-react";

/**
 * Sidebar "Shared" view: notes shared with the current user, and notes they've
 * shared out. Rows open the shared-note viewer at /n/[shortcode].
 */
export default function SharedNavList() {
  const router = useRouter();
  const [withMe, setWithMe] = useState<SharedListItem[]>([]);
  const [byMe, setByMe] = useState<SharedListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [a, b] = await Promise.all([getSharedWithMe(), getSharedByMe()]);
      if (!active) return;
      if (a.success) setWithMe(a.notes);
      if (b.success) setByMe(b.notes);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const open = (shortcode: string) => router.push(`/n/${shortcode}`);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-tertiary)]">
        <IconLoader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (withMe.length === 0 && byMe.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <IconShare2 size={22} className="text-[var(--color-text-tertiary)]" />
        <p className="text-sm text-[var(--color-text-tertiary)]">Nothing shared yet</p>
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          Notes shared with you, and notes you&apos;ve shared, show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
      {withMe.length > 0 && (
        <>
          <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Shared with you
          </div>
          {withMe.map((n) => (
            <button
              key={n.shortcode}
              onClick={() => open(n.shortcode)}
              className="w-full text-left flex items-start gap-2 px-2 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
            >
              <IconUser size={14} className="mt-[3px] text-[var(--color-text-tertiary)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--color-text-primary)] break-words">{n.title}</div>
                <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">from {n.owner}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {byMe.length > 0 && (
        <>
          <div className="px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Shared by you
          </div>
          {byMe.map((n) => (
            <button
              key={n.shortcode}
              onClick={() => open(n.shortcode)}
              className="w-full text-left flex items-start gap-2 px-2 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
            >
              {n.isPublic ? (
                <IconWorld size={14} className="mt-[3px] text-[var(--color-info)] flex-shrink-0" />
              ) : (
                <IconLock size={14} className="mt-[3px] text-[var(--color-text-tertiary)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--color-text-primary)] break-words">{n.title}</div>
                <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 flex items-center gap-2">
                  <span>
                    {n.isPublic
                      ? "Public link"
                      : `${n.readerCount} ${n.readerCount === 1 ? "person" : "people"}`}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <IconEye size={11} />
                    {n.viewCount}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
