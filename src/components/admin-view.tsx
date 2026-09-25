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
  getAllRoadmapItems,
  createRoadmapItem,
  updateRoadmapItem,
  deleteRoadmapItem,
  getNotes,
  adminSetNoteDeleted,
  type PendingSuggestion,
  type AdminUser,
  type AdminRoadmapItem,
  type AdminNote,
} from "@/app/actions/adminActions";
import { ROADMAP_STATUSES, type RoadmapStatusValue } from "@/types/roadmap";

const STATUS_LABEL: Record<string, string> = {
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  { value: "fix", label: "Fix" },
  { value: "feature", label: "Feature" },
];

function CategoryTag({ category }: { category: string | null }) {
  if (category !== "fix" && category !== "feature") return null;
  const isFix = category === "fix";
  return (
    <span
      className="shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)]"
      style={{
        color: isFix ? "var(--color-warn)" : "var(--color-accent-text)",
        background: isFix ? "var(--color-warn-tint)" : "var(--color-accent-tint)",
      }}
    >
      {isFix ? "Fix" : "Feature"}
    </span>
  );
}

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
          ) : section === "Roadmap items" ? (
            <RoadmapItemsPanel />
          ) : section === "Users" ? (
            <UsersPanel />
          ) : (
            <NotesPanel />
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
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-medium text-[var(--color-ink-1)]">{it.title}</span>
                <CategoryTag category={it.category} />
              </div>
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

const RM_INPUT =
  "w-full bg-transparent text-[13px] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:outline-none";
const RM_SELECT =
  "h-7 rounded-[var(--radius-6)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[12px] text-[var(--color-ink-2)] px-1.5 focus:outline-none";

function RoadmapItemsPanel() {
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<AdminRoadmapItem[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [creating, setCreating] = useState(false);
  const [nt, setNt] = useState("");
  const [nb, setNb] = useState("");
  const [ns, setNs] = useState<RoadmapStatusValue>("planned");
  const [nc, setNc] = useState<"" | "fix" | "feature">("");

  const load = useCallback(() => {
    getAllRoadmapItems().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(
    async (id: string, fields: Partial<AdminRoadmapItem>) => {
      setItems((prev) => (prev ?? []).map((it) => (it.id === id ? { ...it, ...fields } : it)));
      const res = await updateRoadmapItem(id, fields as any);
      if (!res.success) { showError("Update failed."); load(); }
    },
    [showError, load],
  );

  const add = useCallback(async () => {
    if (!nt.trim() || creating) return;
    setCreating(true);
    const res = await createRoadmapItem({ title: nt, body: nb, status: ns, category: nc || null, is_public: true });
    setCreating(false);
    if (res.success) { setNt(""); setNb(""); setNs("planned"); setNc(""); showSuccess("Item added."); load(); }
    else showError(res.error || "Couldn't add.");
  }, [nt, nb, ns, nc, creating, showSuccess, showError, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this roadmap item permanently?")) return;
      const res = await deleteRoadmapItem(id);
      if (res.success) { setItems((prev) => (prev ?? []).filter((it) => it.id !== id)); showSuccess("Deleted."); }
      else showError("Delete failed.");
    },
    [showSuccess, showError],
  );

  if (items === null) {
    return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-16 w-full rounded-[var(--radius-10)]" />)}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-12)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] p-4">
        <input value={nt} onChange={(e) => setNt(e.target.value)} placeholder="New item title" maxLength={120} className={`${RM_INPUT} text-[14px] mb-2`} />
        <textarea value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Description (shown on the card)" rows={2} maxLength={2000} className={`${RM_INPUT} resize-none mb-2`} />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select value={ns} onChange={(e) => setNs(e.target.value as RoadmapStatusValue)} className={RM_SELECT}>
              {ROADMAP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select value={nc} onChange={(e) => setNc(e.target.value as "" | "fix" | "feature")} className={RM_SELECT}>
              {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <button onClick={add} disabled={creating || !nt.trim()} className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors disabled:opacity-60">
            {creating ? "Adding…" : "Add item"}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-[13.5px] text-[var(--color-ink-4)]">No items yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-[var(--radius-10)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] p-3">
              {editingId === it.id ? (
                <div className="space-y-2">
                  <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={`${RM_INPUT} text-[14px]`} />
                  <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={2} className={`${RM_INPUT} resize-none`} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]">Cancel</button>
                    <button onClick={async () => { await patch(it.id, { title: draft.title, body: draft.body }); setEditingId(null); }} className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-[var(--color-ink-1)]">{it.title}</div>
                      {it.body && <div className="mt-0.5 text-[12px] leading-[1.5] text-[var(--color-ink-4)]">{it.body}</div>}
                    </div>
                    <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] shrink-0">{it.vote_count} ▲</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <select value={it.status} onChange={(e) => patch(it.id, { status: e.target.value })} className={RM_SELECT}>
                      {ROADMAP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <select value={it.category ?? ""} onChange={(e) => patch(it.id, { category: (e.target.value || null) as any })} className={RM_SELECT}>
                      {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[12px] text-[var(--color-ink-3)]">
                      <input type="checkbox" checked={it.is_public} onChange={(e) => patch(it.id, { is_public: e.target.checked })} />
                      Public
                    </label>
                    <label className="flex items-center gap-1 text-[12px] text-[var(--color-ink-3)]">
                      #
                      <input type="number" value={it.sort_order} onChange={(e) => patch(it.id, { sort_order: parseInt(e.target.value, 10) || 0 })} className="w-14 h-7 rounded-[var(--radius-6)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[12px] text-[var(--color-ink-2)] px-1.5 focus:outline-none" />
                    </label>
                    <div className="flex-1" />
                    <button onClick={() => { setDraft({ title: it.title, body: it.body }); setEditingId(it.id); }} className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]">Edit</button>
                    <button onClick={() => remove(it.id)} className="h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)]">Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesPanel() {
  const { showError } = useToast();
  const [notes, setNotes] = useState<AdminNote[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback((q?: string) => {
    setNotes(null);
    getNotes(q).then(setNotes).catch(() => setNotes([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleDeleted = useCallback(
    async (id: string, deleted: boolean) => {
      setBusy((s) => new Set(s).add(id));
      const res = await adminSetNoteDeleted(id, deleted);
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
      if (res.success) {
        setNotes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, deleted_at: deleted ? new Date().toISOString() : null } : n)));
      } else {
        showError("Action failed — try again.");
      }
    },
    [showError],
  );

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); load(query); }}
        className="flex items-center gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes by title…"
          className="w-full max-w-[340px] h-9 px-3 rounded-[var(--radius-8)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[13px] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:outline-none"
        />
        <button type="submit" className="h-9 px-3 rounded-[var(--radius-8)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)]">Search</button>
      </form>
      <p className="text-[11.5px] text-[var(--color-ink-5)]">Metadata only — note content isn't shown here. Newest 100.</p>

      {notes === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-11 w-full rounded-[var(--radius-9)]" />)}</div>
      ) : notes.length === 0 ? (
        <p className="text-[13.5px] text-[var(--color-ink-4)]">No notes found.</p>
      ) : (
        <div className="rounded-[var(--radius-12)] border border-[var(--color-hairline)] overflow-x-auto">
          <div className="grid min-w-[620px] grid-cols-[1fr_150px_110px_110px] gap-3 px-4 py-2 bg-[var(--color-panel)] border-b border-[var(--color-hairline)] text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
            <span>Title</span>
            <span>Owner</span>
            <span>Updated</span>
            <span className="text-right">Action</span>
          </div>
          {notes.map((n) => (
            <div key={n.id} className="grid min-w-[620px] grid-cols-[1fr_150px_110px_110px] gap-3 px-4 py-2.5 items-center border-b border-[var(--color-hairline-soft)] last:border-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-[13px] text-[var(--color-ink-1)] truncate">{n.title || "Untitled"}</span>
                {n.deleted_at && <span className="shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] bg-[var(--color-danger-tint)] text-[var(--color-danger-strong)]">trashed</span>}
                {n.is_private && <span className="shrink-0 text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">private</span>}
              </div>
              <span className="text-[12px] text-[var(--color-ink-3)] truncate">{n.owner || "—"}</span>
              <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                {n.updated_at ? new Date(n.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
              </span>
              <div className="flex justify-end">
                <button
                  onClick={() => toggleDeleted(n.id, !n.deleted_at)}
                  disabled={busy.has(n.id)}
                  className={`h-7 px-2.5 rounded-[var(--radius-6)] text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    n.deleted_at
                      ? "text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint)]"
                      : "text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)]"
                  }`}
                >
                  {n.deleted_at ? "Restore" : "Trash"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
