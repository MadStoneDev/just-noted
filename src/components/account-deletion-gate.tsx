"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAccountDeletionState, cancelAccountDeletion } from "@/app/actions/accountActions";
import { useToast } from "@/components/ui/toast";

// When the signed-in account is scheduled for deletion, this blocks the app with
// a restore/confirm screen — hiding content during the grace window.
export default function AccountDeletionGate() {
  const { showError } = useToast();
  const [purgeAt, setPurgeAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getAccountDeletionState()
      .then((s) => { if (alive) { setPending(s.pending); setPurgeAt(s.purgeAt); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!pending) return null;

  const dateStr = purgeAt
    ? new Date(purgeAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : "";

  const restore = async () => {
    setBusy(true);
    const r = await cancelAccountDeletion();
    setBusy(false);
    if (r.success) window.location.reload();
    else showError("Couldn't restore your account. Please try again.");
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-[family-name:var(--font-editor)] text-[26px] leading-tight font-medium text-[var(--color-ink)]">
          Account scheduled for deletion
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--color-ink-4)]">
          Your account and everything in it will be permanently deleted{dateStr ? ` on ${dateStr}` : " soon"}.
          You can restore it any time before then.
        </p>
        <p className="mt-2 text-[12px] text-[var(--color-ink-5)]">
          Any paid subscription was already cancelled and won’t be restored.
        </p>
        <button
          onClick={restore}
          disabled={busy}
          className="mt-5 h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? "Restoring…" : "Restore my account"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
