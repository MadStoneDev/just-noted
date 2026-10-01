"use client";

import React, { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/toast";

export default function SecuritySection() {
  const { showSuccess, showError } = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const changePassword = async () => {
    if (pw.length < 8) { showError("Use at least 8 characters."); return; }
    if (pw !== pw2) { showError("The passwords don’t match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) showError(error.message || "Couldn’t update your password.");
    else { setPw(""); setPw2(""); showSuccess("Password updated."); }
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    const { error } = await createClient().auth.signOut({ scope: "global" });
    setSigningOut(false);
    if (error) showError("Couldn’t sign out everywhere.");
    else window.location.href = "/get-access";
  };

  const inputCls =
    "w-full px-3 py-2 text-[13px] bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-accent)] focus:bg-[var(--color-raised)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]";

  return (
    <div className="space-y-8">
      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-relaxed">
        Notes are encrypted in transit and at rest. This is not end-to-end encryption.
      </p>

      <div>
        <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-2">Change password</h2>
        <div className="space-y-2 max-w-[320px]">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" className={inputCls} />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className={inputCls} />
          <button
            onClick={changePassword}
            disabled={busy || !pw || !pw2}
            className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-1">Sessions</h2>
        <p className="text-[12px] text-[var(--color-ink-5)] mb-2">
          Sign out of JustNoted on every device. You’ll need to sign in again here.
        </p>
        <button
          onClick={signOutEverywhere}
          disabled={signingOut}
          className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out everywhere"}
        </button>
      </div>
    </div>
  );
}
