"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { getAccounts, switchToAccount, type DeviceAccount } from "@/utils/accounts";
import { getQueueSize } from "@/utils/offline-queue";
import { useNotesStore } from "@/stores/notes-store";
import { AccountSwitchModal, AccountSwitchTransition } from "@/components/account-switch-modal";
import { Avatar } from "@/components/ui/avatar";
import { IconPlus, IconLogout, IconCheck, IconHelpCircle, IconX } from "@tabler/icons-react";

// Mobile "You" drawer (bottom sheet). Same account logic as AccountMenu, but a
// full-width sheet suited to touch: switch / add / log out, plus Help.
export function MobileAccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<DeviceAccount | null>(null);
  const [switching, setSwitching] = useState<DeviceAccount | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = () => {
      if (!alive) return;
      setAccounts(getAccounts());
      supabase.auth.getUser().then(({ data }) => { if (alive) setCurrentId(data.user?.id ?? null); });
    };
    refresh();
    window.addEventListener("justnoted:accounts-changed", refresh);
    return () => { alive = false; window.removeEventListener("justnoted:accounts-changed", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = accounts.find((a) => a.id === currentId) || null;
  const others = accounts.filter((a) => a.id !== currentId);

  const commitSwitch = useCallback(async (a: DeviceAccount) => {
    setConfirmTarget(null);
    setSwitching(a);
    setBusy(true);
    const res = await switchToAccount(supabase, a); // reloads on success
    if (!res.ok) { setSwitching(null); setBusy(false); setAccounts(getAccounts()); }
  }, [supabase]);

  const doSwitch = useCallback(async (a: DeviceAccount) => {
    const pending = await getQueueSize();
    const localOnly = useNotesStore.getState().notes.filter((n) => !n.deletedAt && n.source === "redis").length;
    const hasOpenShared = typeof document !== "undefined" && !!document.querySelector('[aria-label="Shared note"]');
    if (pending === 0 && localOnly === 0 && !hasOpenShared) { await commitSwitch(a); return; }
    setConfirmTarget(a);
  }, [commitSwitch]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  const hasOpenShared = typeof document !== "undefined" && !!document.querySelector('[aria-label="Shared note"]');

  return (
    <>
      {switching && <AccountSwitchTransition target={switching} />}
      {confirmTarget && (
        <AccountSwitchModal
          target={confirmTarget}
          hasOpenSharedNote={hasOpenShared}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => commitSwitch(confirmTarget)}
        />
      )}

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9600] lg:hidden transition-opacity duration-[var(--duration-slow)] ${
          open ? "bg-[var(--color-bg-overlay)] opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Account"
        className={`fixed inset-x-0 bottom-0 z-[9601] lg:hidden bg-[var(--color-panel-alt)] border-t border-[var(--color-hairline)] rounded-t-[var(--radius-xl)] shadow-[0_-16px_40px_rgba(0,0,0,.35)] transition-transform duration-[var(--duration-slow)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)", transitionTimingFunction: "var(--ease-spring)" }}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--color-hairline-soft)]">
          <span className="text-[14px] font-semibold text-[var(--color-ink-1)]">Account</span>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)]">
            <IconX size={17} />
          </button>
        </div>

        <div className="p-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {current && (
            <div className="flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-10)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)]">
              <Avatar url={current.avatarUrl} name={current.handle || current.email} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-[var(--color-accent-text)] truncate">@{current.handle || "you"}</div>
                <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] truncate">{current.email}</div>
              </div>
              <IconCheck size={17} className="text-[var(--color-accent-text)]" />
            </div>
          )}

          {others.map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() => doSwitch(a)}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-10)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
            >
              <Avatar url={a.avatarUrl} name={a.handle || a.email} size={38} />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[14px] text-[var(--color-ink-1)] truncate">@{a.handle || "account"}</div>
                <div className={`text-[11px] font-[family-name:var(--font-meta)] truncate ${a.sessionValid ? "text-[var(--color-ink-5)]" : "text-[var(--color-warn)]"}`}>
                  {a.sessionValid ? a.email : "session expired — sign in"}
                </div>
              </div>
            </button>
          ))}

          <div className="my-1.5 border-t border-[var(--color-hairline-soft)]" />

          <button
            onClick={() => { window.location.href = "/get-access?add=1"; }}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-10)] text-[14px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            <span className="w-[38px] h-[38px] rounded-full border border-dashed border-[var(--color-border-control-strong)] flex items-center justify-center shrink-0">
              <IconPlus size={17} />
            </span>
            Add another account
          </button>
          <button
            onClick={() => { onClose(); window.dispatchEvent(new Event("justnoted:open-help")); }}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-10)] text-[14px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            <span className="w-[38px] flex items-center justify-center shrink-0">
              <IconHelpCircle size={19} className="text-[var(--color-ink-5)]" />
            </span>
            Help &amp; keyboard shortcuts
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-10)] text-[14px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            <span className="w-[38px] flex items-center justify-center shrink-0">
              <IconLogout size={19} className="text-[var(--color-ink-5)]" />
            </span>
            Sign out{current?.handle ? ` of @${current.handle}` : ""}
          </button>
        </div>
      </div>
    </>
  );
}

export default MobileAccountDrawer;
