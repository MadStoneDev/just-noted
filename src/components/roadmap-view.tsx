"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconX, IconChevronUp, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/ui/toast";
import {
  getRoadmap,
  toggleVote,
  submitSuggestion,
  type RoadmapBoardItem,
} from "@/app/actions/roadmapActions";

// Standalone Roadmap page (opened from the rail). Kanban board backed by
// Supabase (roadmap_items / roadmap_votes): browse, upvote (guests included),
// and suggest features (queued for admin approval). See docs/roadmap.md.

const COLUMNS: { status: string; label: string; dot: string }[] = [
  { status: "under_review", label: "Under review", dot: "var(--color-ink-6)" },
  { status: "planned", label: "Planned", dot: "var(--color-ink-5)" },
  { status: "in_progress", label: "In progress", dot: "var(--color-accent-fill)" },
  { status: "shipped", label: "Shipped", dot: "#3DA35D" },
];

function CategoryTag({ category }: { category: string | null }) {
  if (category !== "fix" && category !== "feature") return null;
  const isFix = category === "fix";
  return (
    <span
      className="shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] border"
      style={{
        color: isFix ? "var(--color-warn)" : "var(--color-accent-text)",
        borderColor: isFix ? "var(--color-warn-tint-border)" : "var(--color-accent-tint-border)",
        background: isFix ? "var(--color-warn-tint)" : "var(--color-accent-tint)",
      }}
    >
      {isFix ? "Fix" : "Feature"}
    </span>
  );
}

export default function RoadmapView({ onClose }: { onClose: () => void }) {
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<RoadmapBoardItem[] | null>(null);
  const [voting, setVoting] = useState<Set<string>>(new Set());
  const [showSuggest, setShowSuggest] = useState(false);
  const [sTitle, setSTitle] = useState("");
  const [sBody, setSBody] = useState("");
  const [sCat, setSCat] = useState<"fix" | "feature" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getRoadmap().then(setItems).catch(() => setItems([]));
  }, []);

  const byStatus = useMemo(() => {
    const m = new Map<string, RoadmapBoardItem[]>();
    for (const it of items ?? []) {
      const arr = m.get(it.status) ?? [];
      arr.push(it);
      m.set(it.status, arr);
    }
    return m;
  }, [items]);

  const vote = useCallback(
    async (id: string) => {
      if (voting.has(id)) return;
      setVoting((s) => new Set(s).add(id));
      // Optimistic toggle.
      setItems((prev) =>
        (prev ?? []).map((it) =>
          it.id === id
            ? { ...it, voted: !it.voted, vote_count: it.vote_count + (it.voted ? -1 : 1) }
            : it,
        ),
      );
      try {
        const res = await toggleVote(id);
        setItems((prev) =>
          (prev ?? []).map((it) =>
            it.id === id ? { ...it, voted: res.voted, vote_count: res.count } : it,
          ),
        );
      } catch {
        // Revert on failure.
        setItems((prev) =>
          (prev ?? []).map((it) =>
            it.id === id
              ? { ...it, voted: !it.voted, vote_count: it.vote_count + (it.voted ? -1 : 1) }
              : it,
          ),
        );
        showError("Couldn't record your vote.");
      } finally {
        setVoting((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [voting, showError],
  );

  const openSuggest = useCallback(() => {
    setSTitle("");
    setSBody("");
    setSCat(null);
    setShowSuggest(true);
  }, []);

  const submit = useCallback(async () => {
    if (submitting || !sTitle.trim() || !sCat) return;
    setSubmitting(true);
    const res = await submitSuggestion(sTitle, sBody, sCat);
    setSubmitting(false);
    if (res.success) {
      showSuccess("Thanks! Your suggestion was sent for review.");
      setShowSuggest(false);
    } else {
      showError(res.error || "Couldn't submit.");
    }
  }, [submitting, sTitle, sBody, sCat, showSuccess, showError]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Roadmap
            </h1>
            <p className="mt-1.5 text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              Vote on what matters to you, or suggest something new.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openSuggest}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-8)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors"
            >
              <IconPlus size={14} /> Suggest
            </button>
            <button
              onClick={onClose}
              aria-label="Close roadmap"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {/* Board */}
        {items === null ? (
          <div className="flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1 min-w-[240px] max-w-[320px] space-y-2">
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-16 w-full rounded-[var(--radius-10)]" />
                <div className="skeleton h-16 w-full rounded-[var(--radius-10)]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
            {COLUMNS.map((col) => {
              const colItems = byStatus.get(col.status) ?? [];
              return (
                <div key={col.status} className="flex-1 min-w-[240px] max-w-[320px]">
                  <div className="flex items-center gap-1.5 mb-2.5 px-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} />
                    <span className="text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
                      {col.label}
                    </span>
                    <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {colItems.length === 0 ? (
                      <div className="rounded-[var(--radius-10)] border border-dashed border-[var(--color-hairline)] p-4 text-[12px] text-[var(--color-ink-6)]">
                        Nothing here yet.
                      </div>
                    ) : (
                      colItems.map((it) => (
                        <div
                          key={it.id}
                          className="rounded-[var(--radius-10)] border border-[var(--color-hairline)] bg-[var(--color-panel-alt)] p-3 flex gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-1.5">
                              <span className="text-[13.5px] font-medium text-[var(--color-ink-1)] min-w-0">{it.title}</span>
                              <CategoryTag category={it.category} />
                            </div>
                            {it.body && (
                              <div className="mt-1 text-[12px] leading-[1.5] text-[var(--color-ink-4)]">{it.body}</div>
                            )}
                          </div>
                          <button
                            onClick={() => vote(it.id)}
                            aria-pressed={it.voted}
                            title={it.voted ? "Remove vote" : "Upvote"}
                            className={`shrink-0 self-start flex flex-col items-center justify-center w-9 py-1 rounded-[var(--radius-8)] border transition-colors ${
                              it.voted
                                ? "border-[var(--color-accent-fill)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                                : "border-[var(--color-border-control)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)]"
                            }`}
                          >
                            <IconChevronUp size={14} />
                            <span className="text-[11px] font-[family-name:var(--font-meta)] leading-none mt-0.5">
                              {it.vote_count}
                            </span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showSuggest &&
        createPortal(
          <div className="fixed inset-0 z-[9500] flex items-start justify-center px-4 pt-[12vh]">
            <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" onClick={() => setShowSuggest(false)} />
            <div className="relative w-full max-w-[460px] bg-[var(--color-panel-alt)] border border-[var(--color-hairline)] rounded-[16px] shadow-[0_24px_60px_rgba(0,0,0,.45)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 h-12 border-b border-[var(--color-hairline-soft)]">
                <span className="flex-1 text-[14px] font-semibold text-[var(--color-ink-1)]">Suggest a fix or feature</span>
                <button onClick={() => setShowSuggest(false)} aria-label="Close" className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)]">
                  <IconX size={16} />
                </button>
              </div>
              <div className="p-4">
                {/* Fix vs feature — required so the owner can triage */}
                <div className="flex gap-2 mb-3">
                  {(["fix", "feature"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setSCat(c)}
                      className={`flex-1 h-9 rounded-[var(--radius-8)] text-[12.5px] font-medium border transition-colors ${
                        sCat === c
                          ? "border-[var(--color-accent-fill)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                          : "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
                      }`}
                    >
                      {c === "fix" ? "A fix" : "New feature"}
                    </button>
                  ))}
                </div>
                <input
                  value={sTitle}
                  onChange={(e) => setSTitle(e.target.value)}
                  placeholder="What would you like to see?"
                  maxLength={120}
                  autoFocus
                  className="w-full bg-transparent text-[14px] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:outline-none mb-2"
                />
                <textarea
                  value={sBody}
                  onChange={(e) => setSBody(e.target.value)}
                  placeholder="Add any detail (optional)"
                  rows={3}
                  maxLength={2000}
                  className="w-full resize-none bg-transparent text-[13px] leading-[1.55] text-[var(--color-ink-2)] placeholder:text-[var(--color-ink-5)] focus:outline-none"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button onClick={() => setShowSuggest(false)} className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting || !sTitle.trim() || !sCat}
                    className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors disabled:opacity-60"
                  >
                    {submitting ? "Sending…" : "Send suggestion"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-ink-5)]">
                  Suggestions are reviewed before they appear on the board.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
