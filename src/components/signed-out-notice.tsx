"use client";

import React, { useEffect, useState } from "react";
import { IconCloudOff } from "@tabler/icons-react";
import { useNotesStore } from "@/stores/notes-store";
import { parkedNotesByAccount, subscribe } from "@/utils/offline-queue";
import { getAccounts } from "@/utils/accounts";

// After a sign-out the user didn't choose (session expired or revoked, token
// refresh failed), the account's unsynced edits are parked, not wiped (see
// utils/sign-out.ts). Say so, and how to get them back: sign in again and they
// sync. A sign-out the user chose leaves nothing parked, so this stays hidden.
export function SignedOutNotice() {
  const isAuthenticated = useNotesStore((s) => s.isAuthenticated);
  const serverSynced = useNotesStore((s) => s.hasServerSynced);
  const [parked, setParked] = useState<{ count: number; email?: string } | null>(null);

  useEffect(() => {
    if (isAuthenticated || !serverSynced) {
      setParked(null);
      return;
    }
    let alive = true;
    const recount = async () => {
      const byAccount = await parkedNotesByAccount();
      if (!alive) return;
      let count = 0;
      for (const ids of byAccount.values()) count += ids.size;
      // Name the account when it's the only one and the device knows it.
      const only = byAccount.size === 1 ? [...byAccount.keys()][0] : null;
      const email = only ? getAccounts().find((a) => a.id === only)?.email : undefined;
      setParked(count > 0 ? { count, email } : null);
    };
    recount();
    const unsubscribe = subscribe(() => void recount());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [isAuthenticated, serverSynced]);

  if (!parked) return null;
  const notes = `${parked.count} unsaved note${parked.count === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="signed-out-notice"
      className="fixed inset-x-0 top-0 z-[9500] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+12px)] pointer-events-none print:hidden"
    >
      <div className="pointer-events-auto flex items-center gap-3 w-full sm:w-auto sm:max-w-[520px] rounded-[var(--radius-12)] border border-[var(--color-warn-tint-border)] bg-[var(--color-warn-tint)] shadow-[0_16px_40px_rgba(0,0,0,.25)] px-4 py-2.5">
        <IconCloudOff size={17} className="text-[var(--color-warn)] shrink-0" />
        <span className="flex-1 text-[13px] leading-snug text-[var(--color-ink-1)]">
          You’ve been signed out — sign in to sync {notes}.
          {parked.email && <span className="text-[var(--color-ink-4)]"> ({parked.email})</span>}
        </span>
        <a
          href="/get-access"
          className="inline-flex items-center h-8 px-3 shrink-0 rounded-[var(--radius-8)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}
