"use client";

import React from "react";
import { Modal } from "@/components/ds/modal";
import { useNotesStore } from "@/stores/notes-store";
import { useOfflineQueue } from "@/hooks/use-online-status";
import type { DeviceAccount } from "@/utils/accounts";
import { IconUser, IconCloudUpload, IconDeviceLaptop } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/avatar";

// Blocking "unsynced work" gate before an account switch (design surface 12).
// Unsynced notes hold the switch until the queue drains (or the user is offline
// and chooses to leave them on the device). Local-only notes are informational.
export function AccountSwitchModal({
  target,
  hasOpenSharedNote,
  onCancel,
  onConfirm,
}: {
  target: DeviceAccount;
  hasOpenSharedNote?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const notes = useNotesStore((s) => s.notes);
  const { pendingCount, isOnline } = useOfflineQueue();
  const localOnly = notes.filter((n) => !n.deletedAt && n.source === "redis").length;

  // While online with pending ops, block the switch until they finish uploading.
  const blockingSync = pendingCount > 0 && isOnline;
  const offlinePending = pendingCount > 0 && !isOnline;

  return (
    <Modal open onClose={onCancel} title={`Switch to @${target.handle || "account"}?`} size="md">
      <div className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar url={target.avatarUrl} name={target.displayName || target.email} size={34} className="ring-1 ring-[var(--color-hairline)]" />
          <div className="min-w-0">
            <div className="text-[13.5px] text-[var(--color-ink-1)] truncate">@{target.handle || "account"}</div>
            <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] truncate">
              {target.email}
            </div>
          </div>
        </div>

        <div className="text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)] pt-1">
          Before you switch
        </div>

        {pendingCount > 0 && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-9)] p-3 bg-[var(--color-warn-tint)] border border-[var(--color-warn-tint-border)]">
            <IconCloudUpload size={17} className="text-[var(--color-warn)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--color-ink-1)]">
                {pendingCount} change{pendingCount !== 1 ? "s" : ""} still syncing
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-4)]">
                {isOnline
                  ? "Hang on — these finish uploading before the switch so nothing is lost."
                  : "You're offline. These stay queued on this device until you sign back in here."}
              </div>
            </div>
          </div>
        )}

        {localOnly > 0 && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-9)] p-3 border border-[var(--color-hairline)]">
            <IconDeviceLaptop size={17} className="text-[var(--color-ink-5)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--color-ink-1)]">
                {localOnly} local-only note{localOnly !== 1 ? "s" : ""} stay on this device
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-4)]">
                Local notes belong to this device, not an account. They'll be here when you switch back.
              </div>
            </div>
          </div>
        )}

        {hasOpenSharedNote && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-9)] p-3 border border-[var(--color-hairline)]">
            <IconUser size={17} className="text-[var(--color-ink-5)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--color-ink-1)]">You're viewing a shared note</div>
              <div className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-4)]">
                Switching will close it. Re-open it with the link once you're on the other account.
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="h-9 px-3.5 rounded-[var(--radius-7)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            Stay here
          </button>
          <button
            onClick={onConfirm}
            disabled={blockingSync}
            className="h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {blockingSync && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-accent-on-fill)] border-t-transparent animate-spin" />
            )}
            {blockingSync ? "Waiting on sync…" : offlinePending ? "Switch anyway" : "Switch account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Full-screen hand-off shown between confirm and reload.
export function AccountSwitchTransition({ target }: { target: DeviceAccount }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[var(--color-canvas)]">
      <div className="relative">
        <Avatar url={target.avatarUrl} name={target.displayName || target.email} size={56} className="ring-1 ring-[var(--color-hairline)]" />
        <span className="absolute inset-0 rounded-full ring-[3px] ring-[var(--color-accent-tint-border)] animate-ping" />
      </div>
      <div className="mt-5 text-[14px] text-[var(--color-ink-1)]">
        Switching to <span className="text-[var(--color-accent-text)]">@{target.handle || "account"}</span>
      </div>
      <div className="mt-3 w-[160px] h-[3px] rounded-full bg-[var(--color-accent-subtle)] overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-[var(--color-accent-fill)] jn-switch-bar" />
      </div>
      <style jsx>{`
        @keyframes jnSwitchBar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(300%);
          }
        }
        .jn-switch-bar {
          animation: jnSwitchBar 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
