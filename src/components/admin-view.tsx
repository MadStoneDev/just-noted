"use client";

import React, { useCallback, useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useToast } from "@/components/ui/toast";
import {
  getPendingSuggestions,
  approveSuggestion,
  declineSuggestion,
  getUsers,
  setUserRole,
  setUserScribe,
  type PendingSuggestion,
  type AdminUser,
} from "@/app/actions/adminActions";

// authors.role scale (see 20260925_author_role.sql).
const ROLE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Banned" },
  { value: 1, label: "Reported" },
  { value: 2, label: "Warned" },
  { value: 3, label: "Active" },
  { value: 10, label: "Admin" },
];

const SECTIONS = ["Roadmap suggestions", "Roadmap items", "Users", "Notes"] as const;
type Section = (typeof SECTIONS)[number];

// Admin dashboard (role >= 10). Settings-style: section nav + main panel. P1
// ships the shell + working roadmap-suggestion moderation; the rest are stubs.
export default function AdminView({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("Roadmap suggestions");

  return (
    <div className="flex-1 flex min-h-0 bg-[var(--color-canvas)]">
      {/* Section nav */}
      <div className="w-[220px] shrink-0 border-r border-[var(--color-hairline)] p-3 hidden md:block">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink-1)] tracking-tight">Admin</h2>
        </div>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`text-left px-2.5 py-2 rounded-[var(--radius-8)] text-[13px] transition-colors ${
                section === s
                  ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                  : "text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)]"
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[820px] px-6 md:px-10 py-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="font-[family-name:var(--font-editor)] text-[30px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              {section}
            </h1>
            <button
              onClick={onClose}
              aria-label="Close admin"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Mobile section switcher */}
          <div className="md:hidden mb-5 flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`px-2.5 py-1 rounded-[var(--radius-6)] text-[12px] transition-colors ${
                  section === s
                    ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                    : "text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {section === "Roadmap suggestions" ? (
            <SuggestionsPanel />
          ) : section === "Users" ? (
            <UsersPanel />
          ) : (
            <p className="text-[13.5px] text-[var(--color-ink-4)] leading-[1.6]">
              {section} management is coming here. For now, {section === "Roadmap items"
                ? "edit items via SQL, or use the parked items CRUD"
                : "review notes via SQL"}
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionsPanel() {
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<PendingSuggestion[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPendingSuggestions().then(setItems).catch(() => setItems([]));
  }, []);

  const act = useCallback(
    async (id: string, kind: "approve" | "decline") => {
      if (busy.has(id)) return;
      setBusy((s) => new Set(s).add(id));
      try {
        const res = kind === "approve" ? await approveSuggestion(id) : await declineSuggestion(id);
        if (res.success) {
          setItems((prev) => (prev ?? []).filter((it) => it.id !== id));
          showSuccess(kind === "approve" ? "Published to the roadmap." : "Declined.");
        } else {
          showError("Action failed — try again.");
        }
      } catch {
        showError("Action failed — try again.");
      } finally {
        setBusy((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [busy, showSuccess, showError],
  );

  if (items === null) {
    return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-20 w-full rounded-[var(--radius-10)]" />)}</div>;
  }
  if (items.length === 0) {
    return <p className="text-[13.5px] text-[var(--color-ink-4)]">No suggestions waiting for review.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => (
        <div key={it.id} className="rounded-[var(--radius-12)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-[var(--color-ink-1)]">{it.title}</div>
              {it.body && <div className="mt-1 text-[12.5px] leading-[1.55] text-[var(--color-ink-4)]">{it.body}</div>}
              <div className="mt-1.5 text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                {it.vote_count} vote{it.vote_count === 1 ? "" : "s"} · {new Date(it.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => act(it.id, "decline")}
                disabled={busy.has(it.id)}
                className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
              >
                Decline
              </button>
              <button
                onClick={() => act(it.id, "approve")}
                disabled={busy.has(it.id)}
                className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersPanel() {
  const { showError } = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const withBusy = useCallback(async (id: string, fn: () => Promise<{ success: boolean }>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      const res = await fn();
      if (!res.success) showError("Action failed — try again.");
      return res.success;
    } catch {
      showError("Action failed — try again.");
      return false;
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }, [showError]);

  const changeRole = useCallback(
    async (id: string, role: number) => {
      setUsers((prev) => (prev ?? []).map((u) => (u.id === id ? { ...u, role } : u)));
      await withBusy(id, () => setUserRole(id, role));
    },
    [withBusy],
  );

  const toggleScribe = useCallback(
    async (id: string, active: boolean) => {
      setUsers((prev) => (prev ?? []).map((u) => (u.id === id ? { ...u, tier: active ? "scribe" : "draft" } : u)));
      const ok = await withBusy(id, () => setUserScribe(id, active));
      if (!ok) setUsers((prev) => (prev ?? []).map((u) => (u.id === id ? { ...u, tier: active ? "draft" : "scribe" } : u)));
    },
    [withBusy],
  );

  if (users === null) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full rounded-[var(--radius-9)]" />)}</div>;
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => (u.username || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : users;

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by username or email…"
        className="w-full max-w-[340px] h-9 px-3 rounded-[var(--radius-8)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[13px] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:outline-none"
      />
      <div className="rounded-[var(--radius-12)] border border-[var(--color-hairline)] overflow-x-auto">
        <div className="grid min-w-[620px] grid-cols-[1fr_130px_120px_90px] gap-3 px-4 py-2 bg-[var(--color-panel)] border-b border-[var(--color-hairline)] text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
          <span>User</span>
          <span>Role</span>
          <span>Plan</span>
          <span className="text-right">Scribe</span>
        </div>
        {filtered.map((u) => (
          <div key={u.id} className="grid min-w-[620px] grid-cols-[1fr_130px_120px_90px] gap-3 px-4 py-2.5 items-center border-b border-[var(--color-hairline-soft)] last:border-0">
            <div className="min-w-0">
              <div className="text-[13px] text-[var(--color-ink-1)] truncate">{u.username || "—"}</div>
              <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] truncate">{u.email}</div>
            </div>
            <select
              value={u.role}
              disabled={busy.has(u.id)}
              onChange={(e) => changeRole(u.id, parseInt(e.target.value, 10))}
              className="h-7 rounded-[var(--radius-6)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[12px] text-[var(--color-ink-2)] px-1.5 focus:outline-none disabled:opacity-50"
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className={`text-[12px] ${u.tier === "scribe" ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-4)]"}`}>
              {u.tier === "scribe" ? "Scribe" : "Draft"}
            </span>
            <div className="flex justify-end">
              <button
                onClick={() => toggleScribe(u.id, u.tier !== "scribe")}
                disabled={busy.has(u.id)}
                className={`h-7 px-2.5 rounded-[var(--radius-6)] text-[11.5px] font-medium border transition-colors disabled:opacity-50 ${
                  u.tier === "scribe"
                    ? "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
                    : "border-[var(--color-accent-fill)] text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint)]"
                }`}
              >
                {u.tier === "scribe" ? "Revoke" : "Grant"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-[13px] text-[var(--color-ink-4)]">No users match.</div>
        )}
      </div>
    </div>
  );
}
