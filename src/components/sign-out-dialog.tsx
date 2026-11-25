"use client";

import React, { useCallback, useRef, useState } from "react";
import { IconCloudUpload, IconAlertTriangle } from "@tabler/icons-react";
import { Modal } from "@/components/ds/modal";
import { createClient } from "@/utils/supabase/client";
import {
  completeSignOut,
  currentAccountId,
  flushOpenEditors,
  syncAccountBeforeSignOut,
  unsyncedNoteCount,
} from "@/utils/sign-out";

// A sign-out the user chose (see utils/sign-out.ts). Unsynced edits hold it
// until they land: "Syncing N notes before signing out…" with Cancel. Only if
// that sync fails is "Sign out anyway — N unsaved notes will be lost" offered.

type Phase =
  | { kind: "idle" }
  | { kind: "syncing"; count: number }
  | { kind: "failed"; count: number }
  | { kind: "signing-out" };

const notesLabel = (n: number) => `${n} note${n === 1 ? "" : "s"}`;

export function useSignOut(opts: {
  /** "global" = every device (Settings → Security). Default: this device. */
  scope?: "global" | "local";
  /** Runs once signed out — typically a navigation. */
  onSignedOut: () => void;
  onError?: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const run = useRef(0); // bumping it cancels the sync in flight
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // `discardUnsynced`: the user chose "Sign out anyway". Otherwise
  // completeSignOut re-counts and refuses if anything unsynced turned up.
  const finish = useCallback(async (accountId: string | null, discardUnsynced = false) => {
    setPhase({ kind: "signing-out" });
    const supabase = createClient();
    const res = await completeSignOut(supabase, accountId, {
      scope: optsRef.current.scope,
      discardUnsynced,
    });
    if (res.unsynced) {
      setPhase({ kind: "failed", count: res.unsynced });
      return;
    }
    if (!res.ok) {
      setPhase({ kind: "idle" });
      optsRef.current.onError?.(res.error || "Couldn’t sign out.");
      return;
    }
    setPhase({ kind: "idle" });
    // Offline, a page load would only show the browser's offline page: the app
    // is already signed out in place (SIGNED_OUT), so the caller's navigation
    // waits for the connection.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      window.addEventListener("online", () => optsRef.current.onSignedOut(), { once: true });
      return;
    }
    optsRef.current.onSignedOut();
  }, []);

  const accountRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    const me = ++run.current;
    const supabase = createClient();
    const accountId = await currentAccountId(supabase);
    accountRef.current = accountId;
    // An open editor's unsaved text goes out (or into the queue) first; an
    // editor that couldn't save or queue it counts as unsynced.
    const flush = await flushOpenEditors();
    if (me !== run.current) return;
    const count = await unsyncedNoteCount(accountId, flush);
    if (me !== run.current) return;
    if (count === 0 || !accountId) return finish(accountId);

    setPhase({ kind: "syncing", count });
    const left = await syncAccountBeforeSignOut(accountId, { cancelled: () => me !== run.current });
    if (me !== run.current) return; // cancelled: stay signed in, nothing touched
    if (left === 0) return finish(accountId);
    setPhase({ kind: "failed", count: left });
  }, [finish]);

  const cancel = useCallback(() => {
    run.current++;
    setPhase({ kind: "idle" });
  }, []);

  const signOutAnyway = useCallback(() => {
    run.current++;
    return finish(accountRef.current, true);
  }, [finish]);

  const dialog =
    phase.kind === "syncing" || phase.kind === "failed" ? (
      <Modal open onClose={cancel} title="Sign out" size="md">
        <div className="space-y-3.5" data-testid="sign-out-dialog">
          {phase.kind === "syncing" ? (
            <div role="status" className="flex items-start gap-2.5 rounded-[var(--radius-9)] p-3 bg-[var(--color-warn-tint)] border border-[var(--color-warn-tint-border)]">
              <IconCloudUpload size={17} className="text-[var(--color-warn)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--color-ink-1)] inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-warn)] border-t-transparent animate-spin" />
                  Syncing {notesLabel(phase.count)} before signing out…
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-4)]">
                  You’ll be signed out once they’ve reached your account.
                </div>
              </div>
            </div>
          ) : (
            <div role="alert" className="flex items-start gap-2.5 rounded-[var(--radius-9)] p-3 bg-[var(--color-warn-tint)] border border-[var(--color-warn-tint-border)]">
              <IconAlertTriangle size={17} className="text-[var(--color-warn)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--color-ink-1)]">
                  Couldn’t sync {notesLabel(phase.count)}
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-4)]">
                  Stay signed in and they’ll sync when the connection is back.
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              onClick={cancel}
              className="h-9 px-3.5 rounded-[var(--radius-7)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
            >
              Cancel
            </button>
            {phase.kind === "failed" && (
              <button
                onClick={signOutAnyway}
                className="h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity"
              >
                Sign out anyway — {notesLabel(phase.count).replace("note", "unsaved note")} will be lost
              </button>
            )}
          </div>
        </div>
      </Modal>
    ) : null;

  return { signOut, busy: phase.kind !== "idle", dialog };
}
