"use client";

import React, { useEffect, useRef, useState } from "react";
import { getUserId } from "@/utils/general/notes";
import { useNotesStore } from "@/stores/notes-store";
import {
  getRecoveryStatus,
  createRecoveryKey,
  recoverWithKey,
  mergeDeviceNotes,
} from "@/app/actions/recoveryActions";

// "Device notes" — a quiet Settings section (shown signed in or out) for the
// recovery key that reaches this browser's local ("Local") notes on another
// device or after clearing data. Never prompts proactively.
export default function DeviceNotesSection() {
  const anonId = useRef<string>("");
  const [exists, setExists] = useState<boolean | null>(null);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const [recoverInput, setRecoverInput] = useState("");
  const [recoverError, setRecoverError] = useState<string | null>(null);

  useEffect(() => {
    try {
      anonId.current = getUserId();
    } catch {
      anonId.current = "";
    }
    if (anonId.current) getRecoveryStatus(anonId.current).then((s) => setExists(s.exists));
  }, []);

  const create = async () => {
    if (!anonId.current) return;
    setBusy(true);
    setCopied(false);
    const r = await createRecoveryKey(anonId.current);
    setBusy(false);
    if (r.success && r.key) {
      setShownKey(r.key);
      setExists(true);
    }
  };

  const copyKey = async () => {
    if (!shownKey) return;
    try {
      await navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const recover = async () => {
    setRecoverError(null);
    if (!recoverInput.trim()) return;
    setBusy(true);
    const r = await recoverWithKey(recoverInput);
    if (!r.success || !r.anonId) {
      setBusy(false);
      setRecoverError(r.error || "That recovery key isn't valid.");
      return;
    }
    const recoveredId = r.anonId;
    const fromId = anonId.current;

    // Don't orphan this browser's own device notes — offer to merge them in.
    const localCount = useNotesStore
      .getState()
      .notes.filter((n) => n.source === "redis" && !n.deletedAt).length;
    if (recoveredId !== fromId && localCount > 0) {
      const merge = window.confirm(
        `This device has ${localCount} local note${localCount === 1 ? "" : "s"}. ` +
          `Merge them into the recovered notes?\n\nOK = merge (your device notes move across). ` +
          `Cancel = keep them separate (the recovered notes replace this view).`,
      );
      if (merge) await mergeDeviceNotes(fromId, recoveredId);
    }

    try {
      localStorage.setItem("notes_user_id", recoveredId);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--color-ink-1)]">Device notes</h3>
        <p className="mt-1 text-[13px] leading-[1.6] text-[var(--color-ink-4)]">
          Local notes live only on this device. A recovery key lets you reach them on another
          browser, or get them back if this browser&apos;s data is cleared. Keep it somewhere safe —
          anyone with it can read your device notes.
        </p>
      </div>

      {/* Recovery key */}
      <div className="rounded-[var(--radius-10)] border border-[var(--color-hairline)] p-4">
        {shownKey ? (
          <div className="space-y-2">
            <div className="text-[12px] text-[var(--color-warn)]">
              Save this now — it won&apos;t be shown again. Regenerate to get a new one.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-[var(--radius-6)] bg-[var(--color-raised-soft)] px-3 py-2 font-mono text-[14px] tracking-wide text-[var(--color-ink-1)]">
                {shownKey}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] text-[var(--color-ink-3)]">
              {exists === null
                ? "Checking…"
                : exists
                  ? "A recovery key already exists for this device. It's stored as a hash, so it can't be shown again — regenerate to create a new one."
                  : "No recovery key yet."}
            </div>
            <button
              onClick={create}
              disabled={busy || exists === null}
              className="shrink-0 px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {exists ? "Regenerate" : "Show recovery key"}
            </button>
          </div>
        )}
      </div>

      {/* Recover from another device */}
      <div className="rounded-[var(--radius-10)] border border-[var(--color-hairline)] p-4 space-y-2">
        <div className="text-[13px] font-medium text-[var(--color-ink-2)]">
          Recover notes from another device
        </div>
        <p className="text-[12px] text-[var(--color-ink-4)] leading-[1.5]">
          Enter the recovery key from your other browser to load its device notes here.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={recoverInput}
            onChange={(e) => setRecoverInput(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            spellCheck={false}
            className="flex-1 px-3 py-2 font-mono text-[13px] rounded-[var(--radius-6)] bg-[var(--color-raised-soft)] border border-transparent focus:border-[var(--color-accent-fill)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
          />
          <button
            onClick={recover}
            disabled={busy || !recoverInput.trim()}
            className="shrink-0 px-3 py-2 text-[12px] font-medium rounded-[var(--radius-6)] border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
          >
            Recover
          </button>
        </div>
        {recoverError && <div className="text-[12px] text-[var(--color-danger)]">{recoverError}</div>}
      </div>
    </div>
  );
}
