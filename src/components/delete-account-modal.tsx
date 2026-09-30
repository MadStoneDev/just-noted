"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ds/modal";
import { createClient } from "@/utils/supabase/client";
import { requestAccountDeletion } from "@/app/actions/accountActions";
import { useToast } from "@/components/ui/toast";

export default function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showError } = useToast();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirm("");
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, [open]);

  const matches = confirm.trim().toLowerCase() === email.trim().toLowerCase() && email.length > 0;

  const submit = async () => {
    if (!matches || busy) return;
    setBusy(true);
    const r = await requestAccountDeletion(confirm);
    setBusy(false);
    if (r.success) {
      window.location.reload(); // the deletion gate takes over
    } else {
      showError(r.error || "Couldn't schedule the deletion.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Delete account" size="sm">
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-3)]">
          This schedules your account for deletion in <strong>30 days</strong>. Your notes, notebooks,
          and shared notes will be permanently removed then. You can restore your account any time
          before that by signing in.
        </p>
        <p className="text-[12.5px] text-[var(--color-ink-4)]">
          Any paid subscription is cancelled now and won’t be restored.
        </p>
        <div>
          <label className="block text-[12px] text-[var(--color-ink-4)] mb-1">
            Type <span className="font-medium text-[var(--color-ink-2)]">{email || "your email"}</span> to confirm
          </label>
          <input
            type="email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            placeholder="your email"
            className="w-full px-3 py-2 text-[13px] bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] border border-transparent focus:border-[var(--color-danger-strong)] focus:bg-[var(--color-raised)] focus:outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!matches || busy}
            className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-semibold bg-[var(--color-danger-strong)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {busy ? "Scheduling…" : "Delete my account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
