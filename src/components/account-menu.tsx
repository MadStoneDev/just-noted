"use client";

import React, { useEffect, useState } from "react";
import { Dropdown } from "@/components/ds/dropdown";
import { createClient } from "@/utils/supabase/client";
import { getAccounts, switchToAccount, type DeviceAccount } from "@/utils/accounts";
import {
  IconUser,
  IconPlus,
  IconLogout,
  IconCheck,
  IconSettings,
} from "@tabler/icons-react";

function Avatar({ url, size }: { url?: string; size: number }) {
  return (
    <span
      className="rounded-full overflow-hidden bg-[var(--color-raised-soft)] ring-1 ring-[var(--color-hairline)] flex items-center justify-center text-[var(--color-ink-4)] shrink-0"
      style={{ width: size, height: size }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <IconUser size={Math.round(size * 0.58)} />}
    </span>
  );
}

// Account switcher popover (design surface 12). Switching swaps the Supabase
// session and reloads. The blocking "unsynced work" modal and the transition
// screen are the next pass.
export default function AccountMenu() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAccounts(getAccounts());
    supabase.auth.getUser().then(({ data }) => setCurrentId(data.user?.id ?? null));
  }, []);

  const current = accounts.find((a) => a.id === currentId) || null;
  const others = accounts.filter((a) => a.id !== currentId);

  const doSwitch = async (a: DeviceAccount) => {
    setBusy(true);
    const res = await switchToAccount(supabase, a); // reloads on success
    if (!res.ok) {
      setBusy(false);
      setAccounts(getAccounts());
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <Dropdown
      placement="right-end"
      trigger={
        <button
          aria-label="Account"
          className="w-[26px] h-[26px] rounded-full overflow-hidden bg-[var(--color-raised-soft)] ring-1 ring-[var(--color-hairline)] flex items-center justify-center text-[var(--color-ink-4)] hover:ring-[var(--color-accent-tint-border)] transition-colors"
        >
          {current?.avatarUrl ? (
            <img src={current.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <IconUser size={15} />
          )}
        </button>
      }
    >
      <div className="w-[260px] p-1">
        <div className="px-2 py-1.5 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
          Signed in
        </div>

        {current && (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[var(--radius-8)] bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)]">
            <Avatar url={current.avatarUrl} size={30} />
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
            <Avatar url={a.avatarUrl} size={30} />
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
  );
}
