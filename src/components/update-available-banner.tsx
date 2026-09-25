"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconRefresh, IconX } from "@tabler/icons-react";
import { processQueue } from "@/utils/offline-queue";

const POLL_MS = 90_000;

/**
 * "JustNoted was updated — refresh" banner. Polls /api/version; when the live
 * deploy's build id differs from the one this tab loaded with, it offers a
 * refresh. Refreshing first flushes the open note (local + cloud) and drains
 * the offline queue, so an in-progress note is saved before the reload.
 */
export default function UpdateAvailableBanner() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  // The build id seen when this tab loaded — the baseline we compare against.
  const loadedRef = useRef<string | null>(null);
  // Build id the user chose to snooze; re-show only if an even newer one ships.
  const dismissedRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = (await res.json()) as { buildId?: string };
      if (!buildId) return;
      // First successful read establishes the baseline for this tab.
      if (loadedRef.current === null) {
        loadedRef.current = buildId;
        return;
      }
      if (buildId !== loadedRef.current && buildId !== dismissedRef.current) {
        setAvailable(true);
      }
    } catch {
      // Offline / transient — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, POLL_MS);
    const onActive = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onActive);
    window.addEventListener("focus", onActive);
    window.addEventListener("online", onActive);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
      window.removeEventListener("online", onActive);
    };
  }, [check]);

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Save first: flush each open editor's pending write to local + cloud,
      // then drain any queued offline ops — the same sequence logout uses.
      window.dispatchEvent(new Event("justnoted:flush"));
      await processQueue().catch(() => {});
      // Let the just-triggered save reach the server before we tear down.
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      window.location.reload();
    }
  }, [busy]);

  const dismiss = useCallback(async () => {
    // Snooze this version; the next poll re-shows only if a newer build lands.
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const { buildId } = (await res.json()) as { buildId?: string };
      dismissedRef.current = buildId ?? null;
    } catch {
      // Ignore — worst case we prompt again on the next poll.
    }
    setAvailable(false);
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9600] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none print:hidden"
    >
      <div className="pointer-events-auto flex items-center gap-3 w-full sm:w-auto sm:max-w-[460px] rounded-[var(--radius-12)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] shadow-[0_16px_40px_rgba(0,0,0,.35)] px-4 py-2.5">
        <span className="flex-1 text-[13px] leading-snug text-[var(--color-ink-1)]">
          JustNoted was updated.
          <span className="text-[var(--color-ink-4)]"> Refresh to get the latest — your note is saved first.</span>
        </span>
        <button
          onClick={refresh}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 shrink-0 rounded-[var(--radius-8)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors disabled:opacity-70"
        >
          <IconRefresh size={14} className={busy ? "animate-spin" : ""} />
          {busy ? "Saving…" : "Refresh"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy}
          aria-label="Dismiss"
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <IconX size={15} />
        </button>
      </div>
    </div>
  );
}
