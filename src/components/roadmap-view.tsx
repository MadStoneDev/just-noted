"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEscapeLayer } from "@/utils/escape-stack";
import { MOBILE_BREAKPOINT } from "@/constants/app";
import { defaultRoadmapTab, nextTabIndex, panelIndexAt } from "@/utils/roadmap-tabs";
import { useRouter } from "next/navigation";
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

// Phone layout (below the app's mobile breakpoint, = Tailwind `md`): a tab bar
// over a horizontal scroll-snap strip, one full-width list per screen. md and up:
// the four lists side by side. Both are the same DOM; only classes differ.
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 0.02}px)`;
const PREFERRED_TAB = COLUMNS.findIndex((c) => c.status === "in_progress");
const tabId = (status: string) => `roadmap-tab-${status}`;
const panelId = (status: string) => `roadmap-panel-${status}`;

function isPhone() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Server render has no window; fall back to useEffect there to avoid the warning.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function CategoryTag({ category }: { category: string | null }) {
  if (category !== "fix" && category !== "feature") return null;
  const isFix = category === "fix";
  return (
    <span
      className="shrink-0 text-label font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] border"
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

export default function RoadmapView() {
  const router = useRouter();
  const onClose = () => router.push("/");
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<RoadmapBoardItem[] | null>(null);
  const [voting, setVoting] = useState<Set<string>>(new Set());
  const [showSuggest, setShowSuggest] = useState(false);
  useEscapeLayer(showSuggest, () => setShowSuggest(false));
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

  // ── Phone tabs ↔ scroll-snap strip ──────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(PREFERRED_TAB);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [phone, setPhone] = useState(false); // ARIA roles only; layout is CSS
  // A tab tap scrolls smoothly through the lists in between; ignore those
  // intermediate positions so the active tab doesn't flicker across them.
  const seeking = useRef<number | null>(null);
  // Once the visitor picks a list, loading the items must not move them.
  const userMoved = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const scrollToPanel = useCallback((idx: number, smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el || !isPhone()) return;
    const left = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) < 1) return;
    const animate = smooth && !prefersReducedMotion();
    seeking.current = animate ? idx : null;
    el.scrollTo({ left, behavior: animate ? "smooth" : "auto" });
  }, []);

  // Open on In progress at first paint (the skeleton), then — once the items
  // arrive — on the first list with items if In progress turns out empty.
  useIsoLayoutEffect(() => {
    scrollToPanel(PREFERRED_TAB, false);
  }, [scrollToPanel]);
  const initialised = useRef(false);
  useIsoLayoutEffect(() => {
    if (items === null || initialised.current) return;
    initialised.current = true;
    if (userMoved.current) return;
    const idx = defaultRoadmapTab(COLUMNS.map((c) => byStatus.get(c.status)?.length ?? 0), PREFERRED_TAB);
    setActive(idx);
    scrollToPanel(idx, false);
  }, [items, byStatus, scrollToPanel]);

  // Swiping updates the active tab.
  const syncFromScroll = useCallback((settled: boolean) => {
    const el = scrollerRef.current;
    if (!el || !isPhone()) return;
    const idx = panelIndexAt(el.scrollLeft, el.clientWidth, COLUMNS.length);
    if (seeking.current !== null) {
      if (!settled && idx !== seeking.current) return;
      seeking.current = null;
    }
    if (idx !== activeRef.current) userMoved.current = true;
    setActive(idx);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => syncFromScroll(false);
    const onScrollEnd = () => syncFromScroll(true);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    // Rotation / resize: keep the active list in view at the new width.
    const ro = new ResizeObserver(() => {
      if (!isPhone()) return;
      seeking.current = null;
      el.scrollTo({ left: activeRef.current * el.clientWidth, behavior: "auto" });
    });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      ro.disconnect();
    };
  }, [syncFromScroll]);

  // Tapping a tab scrolls to that list.
  const selectTab = useCallback(
    (idx: number) => {
      userMoved.current = true;
      setActive(idx);
      scrollToPanel(idx, true);
    },
    [scrollToPanel],
  );

  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      const next = nextTabIndex(e.key, idx, COLUMNS.length);
      if (next === null) return;
      e.preventDefault();
      selectTab(next);
      tabRefs.current[next]?.focus();
    },
    [selectTab],
  );

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
      showSuccess("Thanks. Your suggestion was sent for review.");
      setShowSuggest(false);
    } else {
      showError(res.error || "Couldn't submit.");
    }
  }, [submitting, sTitle, sBody, sCat, showSuccess, showError]);

  const renderCard = (it: RoadmapBoardItem) => (
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
        <span className="text-meta font-[family-name:var(--font-meta)] leading-none mt-0.5">
          {it.vote_count}
        </span>
      </button>
    </div>
  );

  return (
    // Fills the shell's main area (already 100dvh minus the shell chrome), so the
    // page itself never scrolls — each list scrolls on its own.
    <div data-testid="roadmap" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--color-canvas)]">
      {/* Header */}
      <div className="shrink-0 mx-auto w-full max-w-[1200px] px-4 md:px-10 pt-6 pb-4 md:pt-10 md:pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Roadmap
            </h1>
            <p className="mt-1.5 text-meta font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
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
      </div>

      {/* Phone tab bar: all four lists, one tap away. Fixed-height tabs, and the
          active state changes colour only (no weight change) — no layout shift. */}
      <div
        role="tablist"
        aria-label="Roadmap lists"
        className="md:hidden shrink-0 grid grid-cols-4 px-2 border-b border-[var(--color-hairline)]"
      >
        {COLUMNS.map((col, i) => {
          const selected = i === active;
          const count = items === null ? null : (byStatus.get(col.status)?.length ?? 0);
          return (
            <button
              key={col.status}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={tabId(col.status)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(col.status)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(i)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`relative min-w-0 h-12 px-1 flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-fill)] rounded-t-[var(--radius-6)] ${
                selected ? "text-[var(--color-ink-1)]" : "text-[var(--color-ink-5)] hover:text-[var(--color-ink-3)]"
              }`}
            >
              <span className="max-w-full truncate text-label font-medium">{col.label}</span>
              <span className="flex items-center gap-1 text-meta font-[family-name:var(--font-meta)]">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} />
                {count ?? " "}
              </span>
              <span
                aria-hidden
                className={`absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-[var(--color-accent-fill)] transition-opacity ${
                  selected ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Board. Phone: horizontal scroll-snap strip, one full-width list per
          screen. md+: four columns side by side (scrolls sideways if narrower than
          four minimum-width columns, e.g. tablet portrait). */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:snap-none md:gap-4 md:mx-auto md:w-full md:max-w-[1200px] md:px-10 md:pb-6 md:[scrollbar-width:thin] md:[&::-webkit-scrollbar]:block"
      >
        {COLUMNS.map((col) => {
          const colItems = byStatus.get(col.status) ?? [];
          return (
            <section
              key={col.status}
              id={panelId(col.status)}
              aria-label={phone ? undefined : col.label}
              {...(phone ? { role: "tabpanel", "aria-labelledby": tabId(col.status) } : {})}
              className="shrink-0 basis-full min-w-0 snap-start snap-always flex flex-col min-h-0 md:shrink md:basis-0 md:flex-1 md:min-w-[220px] md:max-w-[320px]"
            >
              {/* Column header (md+): stays put while the list below scrolls. */}
              <div className="hidden md:flex shrink-0 items-center gap-1.5 mb-2.5 px-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} />
                <span className="text-label font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
                  {col.label}
                </span>
                <span className="text-meta font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                  {items === null ? "" : colItems.length}
                </span>
              </div>
              <div
                data-testid={`roadmap-list-${col.status}`}
                className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-thin px-4 pt-4 pb-6 md:p-0 md:[scrollbar-gutter:stable]"
              >
                <div className="flex flex-col gap-2">
                  {items === null ? (
                    <>
                      <div className="skeleton h-16 w-full rounded-[var(--radius-10)]" />
                      <div className="skeleton h-16 w-full rounded-[var(--radius-10)]" />
                    </>
                  ) : colItems.length === 0 ? (
                    <div className="rounded-[var(--radius-10)] border border-dashed border-[var(--color-hairline)] p-4 text-[12px] text-[var(--color-ink-5)]">
                      Nothing here yet.
                    </div>
                  ) : (
                    colItems.map(renderCard)
                  )}
                </div>
              </div>
            </section>
          );
        })}
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
                <p className="mt-2 text-meta text-[var(--color-ink-5)]">
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
