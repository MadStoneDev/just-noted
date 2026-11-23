"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getAccounts } from "@/utils/accounts";
import {
  discardRemovedAccountsParked,
  removedAccountsParked,
  subscribe as subscribeQueue,
} from "@/utils/offline-queue";

// Settings → Sync & data. Edits of an account that has since been removed from
// this device stay parked in the offline queue (they'd sync if it signed in
// here again). Say how many, and let the user discard them — after a confirm.
// Nothing is ever deleted automatically. Hidden when there's nothing parked.
export default function RemovedAccountNotesSection() {
  const [count, setCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDevice = () => getAccounts().map((a) => a.id);

  const recount = useCallback(async () => {
    try {
      let n = 0;
      for (const ids of (await removedAccountsParked(onDevice())).values()) n += ids.size;
      setCount(n);
      if (n === 0) setConfirming(false);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    recount();
    const unsubscribe = subscribeQueue(() => void recount());
    const onAccounts = () => void recount();
    window.addEventListener("justnoted:accounts-changed", onAccounts);
    return () => {
      unsubscribe();
      window.removeEventListener("justnoted:accounts-changed", onAccounts);
    };
  }, [recount]);

  const discard = async () => {
    setBusy(true);
    try {
      await discardRemovedAccountsParked(onDevice());
    } finally {
      setBusy(false);
      setConfirming(false);
      recount();
    }
  };

  if (count === 0) return null;
  const notes = `${count} unsynced note${count === 1 ? "" : "s"}`;

  return (
    <div data-testid="removed-account-notes">
      <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-1.5">Unsynced notes</h2>
      <div className="rounded-[var(--radius-10)] border border-[var(--color-warn-tint-border)] bg-[var(--color-warn-tint)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[var(--color-ink-1)]">
              {notes} from a removed account
            </div>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-[var(--color-ink-4)]">
              Edits that never reached the cloud. They sync if you add that account back on this
              device and sign in.
            </p>
          </div>
          {!confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="shrink-0 px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
            >
              Discard
            </button>
          )}
        </div>
        {confirming && (
          <div
            role="alertdialog"
            aria-label="Discard unsynced notes"
            className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-warn-tint-border)] pt-3"
          >
            <span className="text-[12.5px] text-[var(--color-ink-2)]">
              Discard {notes}? This can&apos;t be undone.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={discard}
                disabled={busy}
                className="px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {busy ? "Discarding…" : `Discard ${notes}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
