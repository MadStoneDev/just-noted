"use client";

import React, { useEffect, useState } from "react";
import { Dropdown } from "@/components/ds/dropdown";
import { createClient } from "@/utils/supabase/client";
import { getAccounts, switchToAccount, type DeviceAccount } from "@/utils/accounts";
import { getQueueSize } from "@/utils/offline-queue";
import { useNotesStore } from "@/stores/notes-store";
import { AccountSwitchModal, AccountSwitchTransition } from "@/components/account-switch-modal";
import {
  IconPlus,
  IconLogout,
  IconCheck,
  IconSettings,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/avatar";

// Account switcher popover (design surface 12). Switching swaps the Supabase
// session and reloads. The blocking "unsynced work" modal and the transition
// screen are the next pass.
export default function AccountMenu() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Target of a pending switch: shown in the confirm modal, then the transition.
  const [confirmTarget, setConfirmTarget] = useState<DeviceAccount | null>(null);
  const [switching, setSwitching] = useState<DeviceAccount | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!alive) return;
      setAccounts(getAccounts());
      supabase.auth.getUser().then(({ data }) => { if (alive) setCurrentId(data.user?.id ?? null); });
    };
    refresh();
    // Re-read when an account is captured/added/removed, and when auth changes
    // (e.g. after signing in a second account) — no page refresh needed.
    window.addEventListener("justnoted:accounts-changed", refresh);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      alive = false;
      window.removeEventListener("justnoted:accounts-changed", refresh);
      subscription.unsubscribe();
    };
  }, []);

  const current = accounts.find((a) => a.id === currentId) || null;
  const others = accounts.filter((a) => a.id !== currentId);

  // ⌃1–⌃9 jump to the Nth other account.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const n = parseInt(e.key, 10);
      if (!n || n < 1 || n > 9) return;
      const target = others[n - 1];
      if (!target || busy || switching || confirmTarget) return;
      e.preventDefault();
      doSwitch(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, currentId, busy, switching, confirmTarget]);

  // Run the actual session swap (reloads on success).
  const commitSwitch = async (a: DeviceAccount) => {
    setConfirmTarget(null);
    setSwitching(a);
    setBusy(true);
    const res = await switchToAccount(supabase, a); // reloads on success
    if (!res.ok) {
      setSwitching(null);
      setBusy(false);
      setAccounts(getAccounts());
    }
  };

  // Decide whether a switch is clean (go straight) or needs the confirm gate.
  const doSwitch = async (a: DeviceAccount) => {
    const pending = await getQueueSize();
    const localOnly = useNotesStore
      .getState()
      .notes.filter((n) => !n.deletedAt && n.source === "redis").length;
    const hasOpenShared = typeof document !== "undefined" && !!document.querySelector('[aria-label="Shared note"]');
    if (pending === 0 && localOnly === 0 && !hasOpenShared) {
      await commitSwitch(a);
      return;
    }
    setConfirmTarget(a);
  };

  const hasOpenShared =
    typeof document !== "undefined" && !!document.querySelector('[aria-label="Shared note"]');

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

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
    <Dropdown
      placement="right-end"
      trigger={
        <button
          aria-label="Account"
          className="rounded-full ring-1 ring-[var(--color-hairline)] hover:ring-[var(--color-accent-tint-border)] transition-colors"
        >
          <Avatar url={current?.avatarUrl} name={current?.handle || current?.email} size={26} />
        </button>
      }
    >
      <div className="w-[260px] p-1">
        <div className="px-2 py-1.5 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
          Signed in
        </div>

        {current && (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[var(--radius-8)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)]">
            <Avatar url={current.avatarUrl} name={current.handle || current.email} size={30} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[var(--color-accent-text)] truncate">@{current.handle || "you"}</div>
              <div className="text-[10.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] truncate">{current.email}</div>
            </div>
            <IconCheck size={15} className="text-[var(--color-accent-text)]" />
          </div>
        )}

        {others.map((a, i) => (
          <button
            key={a.id}
            disabled={busy}
            onClick={() => doSwitch(a)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--radius-8)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
          >
            <Avatar url={a.avatarUrl} name={a.handle || a.email} size={30} />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[13px] text-[var(--color-ink-1)] truncate">@{a.handle || "account"}</div>
              <div className={`text-[10.5px] font-[family-name:var(--font-meta)] truncate ${a.sessionValid ? "text-[var(--color-ink-5)]" : "text-[var(--color-warn)]"}`}>
                {a.sessionValid ? a.email : "session expired — sign in"}
              </div>
            </div>
            {i < 9 && (
              <span className="text-[10px] font-[family-name:var(--font-meta)] px-1 py-0.5 rounded-[var(--radius-4)] border border-[var(--color-border-control)] text-[var(--color-ink-5)]">
                ⌃{i + 1}
              </span>
            )}
          </button>
        ))}

        <div className="my-1 border-t border-[var(--color-hairline-soft)]" />

        <button
          onClick={() => { window.location.href = "/get-access?add=1"; }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-8)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <span className="w-[30px] h-[30px] rounded-full border border-dashed border-[var(--color-border-control-strong)] flex items-center justify-center">
            <IconPlus size={15} />
          </span>
          Add another account
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event("justnoted:open-settings"))}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-8)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <IconSettings size={15} className="text-[var(--color-ink-5)]" />
          Manage accounts
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-8)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <IconLogout size={15} className="text-[var(--color-ink-5)]" />
          Sign out{current?.handle ? ` of @${current.handle}` : ""}
        </button>
      </div>
    </Dropdown>
    </>
  );
}
