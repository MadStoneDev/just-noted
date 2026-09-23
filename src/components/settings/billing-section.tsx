"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { SUBSCRIPTION_LIMITS, type SubscriptionTier } from "@/types/subscription";
import { NOTEBOOK_LIMITS } from "@/types/notebook";
import { openUpgradeCheckout, billingConfigured } from "@/lib/billing-client";
import { getPortalUrl } from "@/app/actions/billingActions";
import { useToast } from "@/components/ui/toast";
import { IconCheck, IconSparkles } from "@tabler/icons-react";

const TIER_LABEL: Record<SubscriptionTier, string> = { draft: "Draft", scribe: "Scribe" };

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : Math.min(100, limit === 0 ? (used > 0 ? 100 : 0) : (used / limit) * 100);
  const over = !unlimited && limit > 0 && used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] text-[var(--color-ink-2)]">{label}</span>
        <span className="text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
          {used}
          {unlimited ? " · unlimited" : ` / ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 rounded-full bg-[var(--color-raised-soft)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: over ? "var(--color-warn)" : "var(--color-accent-fill)" }}
          />
        </div>
      )}
    </div>
  );
}

export default function BillingSection() {
  const supabase = createClient();
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<SubscriptionTier>("draft");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [renews, setRenews] = useState<string | null>(null);
  const [cancelAtEnd, setCancelAtEnd] = useState(false);
  const [usage, setUsage] = useState({ notes: 0, notebooks: 0, collaborators: 0 });
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) { if (alive) setLoading(false); return; }
      setUserId(user.id);
      setEmail(user.email || "");

      const [{ data: sub }, notesCount, notebooksCount, shareRows] = await Promise.all([
        supabase.from("subscriptions").select("tier, status, current_period_end, cancel_at_period_end").eq("user_id", user.id).maybeSingle(),
        supabase.from("notes").select("id", { count: "exact", head: true }).eq("author", user.id).is("deleted_at", null),
        supabase.from("notebooks").select("id", { count: "exact", head: true }).eq("owner", user.id),
        supabase.from("shared_notes").select("id").eq("note_owner_id", user.id),
      ]);
      if (!alive) return;

      const status = (sub as any)?.status;
      const t = (sub as any)?.tier as string | undefined;
      const activeTier: SubscriptionTier =
        (status === "active" || status === "trialing") && t === "scribe" ? "scribe" : "draft";
      setTier(activeTier);
      setRenews((sub as any)?.current_period_end ?? null);
      setCancelAtEnd(!!(sub as any)?.cancel_at_period_end);

      // Count named editors across the user's shared notes.
      let collaborators = 0;
      const shareIds = ((shareRows.data as any[]) || []).map((s) => s.id);
      if (shareIds.length > 0) {
        const { data: editorRows } = await supabase
          .from("shared_notes_readers")
          .select("id, role")
          .in("shared_note", shareIds);
        collaborators = ((editorRows as any[]) || []).filter((r) => r.role === "edit").length;
      }
      setUsage({
        notes: notesCount.count || 0,
        notebooks: notebooksCount.count || 0,
        collaborators,
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const limits = SUBSCRIPTION_LIMITS[tier];
  const notebookLimit = tier === "draft" ? NOTEBOOK_LIMITS.free : NOTEBOOK_LIMITS.premium;

  const upgrade = async () => {
    const ok = await openUpgradeCheckout({ email, userId });
    if (!ok) showError("Checkout isn’t available yet — billing is still being set up.");
  };

  const manage = async () => {
    setPortalBusy(true);
    const url = await getPortalUrl();
    setPortalBusy(false);
    if (url) window.open(url, "_blank");
    else showError("Couldn’t open the billing portal.");
  };

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full rounded-[var(--radius-8)]" />)}</div>;
  }

  const isPaid = tier !== "draft";

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="rounded-[var(--radius-9)] border border-[var(--color-hairline)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-[var(--color-ink-1)]">{TIER_LABEL[tier]} plan</span>
              {isPaid && (
                <span className="text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]">
                  active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-5)]">
              {isPaid
                ? renews
                  ? `${cancelAtEnd ? "Ends" : "Renews"} ${new Date(renews).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                  : "Active subscription"
                : "Note-taking, sharing, and a taste of AI — free forever."}
            </p>
          </div>
          {isPaid && (
            <button
              onClick={manage}
              disabled={portalBusy}
              className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
            >
              {portalBusy ? "Opening…" : "Manage"}
            </button>
          )}
        </div>
      </div>

      {/* Usage */}
      <div>
        <div className="mb-2 text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">Usage</div>
        <div className="space-y-3.5">
          <Meter label="Notes" used={usage.notes} limit={limits.maxNotes} />
          <Meter label="Notebooks" used={usage.notebooks} limit={notebookLimit} />
          <Meter label="Collaborators (editors)" used={usage.collaborators} limit={limits.maxCollaborators} />
        </div>
      </div>

      {/* Upgrade */}
      {!isPaid && (
        <div className="rounded-[var(--radius-9)] border border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] p-4">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--color-accent-text)]">
            <IconSparkles size={16} />
            Become a Scribe
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--color-ink-2)]">
            {["Share notes others can edit — with live collaboration", "Unlimited notebooks", "Full AI", "100 versions of history"].map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <IconCheck size={13} className="text-[var(--color-accent-text)] shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <button
              onClick={upgrade}
              className="h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
            >
              Upgrade to Scribe
            </button>
          </div>
          {!billingConfigured() && (
            <p className="mt-2 text-[11px] text-[var(--color-ink-5)]">Checkout is being set up — the button will be live once billing is configured.</p>
          )}
        </div>
      )}
    </div>
  );
}
