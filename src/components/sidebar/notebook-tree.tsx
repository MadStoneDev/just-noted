"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNotesStore, useNotebooks } from "@/stores/notes-store";
import {
  IconChevronRight,
  IconChevronDown,
  IconNote,
  IconFileOff,
  IconPlus,
  IconDots,
  IconLock,
} from "@tabler/icons-react";

// Sidebar notebook tree (03-notebooks.md §3). Visible at both Level 1 (/notebooks)
// and Level 2 (/notebooks/:id). Its job is filing + fast switching: one-line
// rows, All/Loose above a hairline, chevrons only on parents with sections,
// counts that include sections, drag-to-file with auto-expand, persisted collapse.

const EXPANDED_KEY = "jn_nb_expanded";

// Dot colour from the new `colour` enum (spec §9, dark values), with a legacy
// fallback to the old flat hex.
const COLOUR_HEX: Record<string, string> = {
  violet: "#8B7BF0",
  "violet-light": "#A897F7",
  blue: "#3B82F6",
  indigo: "#6366F1",
  pink: "#EC4899",
  green: "#10B981",
};
function dotColour(nb: { colour?: string; coverType?: string; coverValue?: string }): string {
  if (nb.colour && COLOUR_HEX[nb.colour]) return COLOUR_HEX[nb.colour];
  if (nb.coverType === "color" && nb.coverValue) return nb.coverValue;
  return "var(--color-accent-fill)";
}

export default function NotebookTree() {
  const router = useRouter();
  const pathname = usePathname();
  const notebooks = useNotebooks();
  const {
    notes,
    notebookCounts,
    looseNotesCount,
    setActiveNotebookId,
    optimisticUpdateNote,
    recalculateNotebookCounts,
  } = useNotesStore();

  const selectedId = useMemo(() => {
    const m = pathname.match(/^\/notebooks\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const rootNotebooks = useMemo(() => notebooks.filter((nb) => !nb.parentId), [notebooks]);
  const childrenOf = useCallback(
    (id: string) => notebooks.filter((nb) => nb.parentId === id),
    [notebooks],
  );

  const totalNotesCount = useMemo(
    () => notes.filter((n) => n.source === "supabase" && !n.deletedAt).length,
    [notes],
  );

  // Persisted expand/collapse (collapsed by default).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);
  const persist = (next: Set<string>) => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch {}
  };
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next);
      return next;
    });
  };

  // The current section force-expands its parent so it's visible/selected.
  const selectedParentId = selectedId
    ? notebooks.find((n) => n.id === selectedId)?.parentId ?? null
    : null;
  const isExpanded = (id: string) => expanded.has(id) || id === selectedParentId;

  // Drag-to-file: tint the target and auto-expand a collapsed parent after 600ms.
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoExpand = () => {
    if (autoExpandTimer.current) { clearTimeout(autoExpandTimer.current); autoExpandTimer.current = null; }
  };
  const isNoteDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("application/x-jn-note");
  const onRowDragOver = (e: React.DragEvent, id: string, hasChildren: boolean) => {
    if (!isNoteDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) {
      setDragOverId(id);
      clearAutoExpand();
      if (hasChildren && !isExpanded(id)) {
        autoExpandTimer.current = setTimeout(() => toggle(id), 600);
      }
    }
  };
  const onRowDrop = (e: React.DragEvent, id: string) => {
    clearAutoExpand();
    setDragOverId(null);
    const noteId = e.dataTransfer.getData("application/x-jn-note");
    if (!noteId) return;
    e.preventDefault();
    optimisticUpdateNote(noteId, { notebookId: id });
    recalculateNotebookCounts();
    import("@/app/actions/notebookActions").then(({ bulkAssignNotesToNotebook }) => {
      bulkAssignNotesToNotebook([noteId], id);
    });
  };
  useEffect(() => () => clearAutoExpand(), []);

  const openNotebook = (id: string, hasChildren: boolean) => {
    if (hasChildren && !expanded.has(id)) toggle(id); // name click also expands
    router.push(`/notebooks/${id}`);
  };
  const openNotesView = (filter: string | null) => {
    setActiveNotebookId(filter);
    window.dispatchEvent(new Event("justnoted:show-notes"));
    router.push("/");
  };

  const Row = ({ nb, isSection }: { nb: typeof notebooks[number]; isSection: boolean }) => {
    const children = childrenOf(nb.id);
    const hasChildren = children.length > 0;
    const childTotal = children.reduce((s, c) => s + (notebookCounts[c.id] || 0), 0);
    const count = (notebookCounts[nb.id] || 0) + (isSection ? 0 : childTotal);
    const selected = selectedId === nb.id;
    const priv = (nb as { isHidden?: boolean; isPrivate?: boolean }).isHidden ||
      (nb as { isPrivate?: boolean }).isPrivate;

    return (
      <div
        onDragOver={(e) => onRowDragOver(e, nb.id, hasChildren)}
        onDragLeave={() => setDragOverId((c) => (c === nb.id ? null : c))}
        onDrop={(e) => onRowDrop(e, nb.id)}
        className={`group/row flex items-center h-9 rounded-[var(--radius-8)] pr-1.5 transition-colors ${
          isSection ? "pl-[28px]" : "pl-2.5"
        } ${
          dragOverId === nb.id
            ? "ring-1"
            : selected
              ? "bg-[var(--color-accent-tint)] border border-[var(--color-accent-tint-border)]"
              : "border border-transparent hover:bg-[var(--color-raised-soft)]"
        }`}
        style={dragOverId === nb.id ? { backgroundColor: dotColour(nb) + "24", boxShadow: `inset 0 0 0 1px ${dotColour(nb)}` } : undefined}
      >
        {/* Chevron (only when it has sections) or an aligning spacer */}
        {!isSection && hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggle(nb.id); }}
            aria-label={isExpanded(nb.id) ? "Collapse" : "Expand"}
            className="w-3 flex-none text-[var(--color-ink-4)] hover:text-[var(--color-ink-2)]"
          >
            {isExpanded(nb.id) ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3 flex-none" />
        )}

        <button
          onClick={() => openNotebook(nb.id, hasChildren)}
          className="flex-1 min-w-0 flex items-center gap-2.5 pl-1.5 text-left"
        >
          <span className="w-[7px] h-[7px] rounded-[2px] flex-none" style={{ backgroundColor: dotColour(nb) }} />
          <span className={`flex-1 min-w-0 truncate text-[13.5px] ${selected ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>
            {nb.name}
          </span>
          {priv && <IconLock size={12} className="flex-none text-[var(--color-ink-4)]" />}
          <span className={`flex-none font-[family-name:var(--font-meta)] text-[11px] ${selected ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-5)]"}`}>
            {count}
          </span>
        </button>

        {/* Row actions (edit via the existing modal) */}
        <button
          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("justnoted:edit-notebook", { detail: nb.id })); }}
          aria-label="Notebook options"
          title="Edit notebook"
          className="ml-1 w-6 h-6 flex-none flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] opacity-0 group-hover/row:opacity-100 hover:bg-[var(--color-active)] hover:text-[var(--color-ink-1)] transition-all"
        >
          <IconDots size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between h-[52px] flex-none px-4 border-b border-[var(--color-hairline-soft)]">
        <h2 className="text-sm font-semibold text-[var(--color-ink-1)] tracking-tight">Notebooks</h2>
        <span className="font-[family-name:var(--font-meta)] text-[11px] text-[var(--color-ink-5)]">
          {rootNotebooks.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {/* All notes / Loose notes (derived views) */}
        <button
          onClick={() => openNotesView(null)}
          className="w-full flex items-center h-9 pl-2.5 pr-1.5 rounded-[var(--radius-8)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <span className="w-3 flex-none" />
          <IconNote size={14} className="ml-1.5 flex-none text-[var(--color-ink-5)]" />
          <span className="flex-1 min-w-0 truncate pl-2 text-left text-[13.5px] text-[var(--color-ink-2)]">All notes</span>
          <span className="flex-none font-[family-name:var(--font-meta)] text-[11px] text-[var(--color-ink-5)]">{totalNotesCount}</span>
        </button>
        <button
          onClick={() => openNotesView("loose")}
          className="w-full flex items-center h-9 pl-2.5 pr-1.5 rounded-[var(--radius-8)] hover:bg-[var(--color-raised-soft)] transition-colors"
        >
          <span className="w-3 flex-none" />
          <IconFileOff size={14} className="ml-1.5 flex-none text-[var(--color-ink-6)]" />
          <span className="flex-1 min-w-0 truncate pl-2 text-left text-[13.5px] text-[var(--color-ink-2)]">Loose notes</span>
          <span className="flex-none font-[family-name:var(--font-meta)] text-[11px] text-[var(--color-ink-5)]">{looseNotesCount}</span>
        </button>

        {rootNotebooks.length > 0 && <div className="h-px bg-[var(--color-hairline-soft)] my-2" />}

        {/* Top-level notebooks + their sections */}
        {rootNotebooks.map((nb) => {
          const children = childrenOf(nb.id);
          return (
            <React.Fragment key={nb.id}>
              <Row nb={nb} isSection={false} />
              {children.length > 0 && isExpanded(nb.id) &&
                children.map((c) => <Row key={c.id} nb={c} isSection />)}
            </React.Fragment>
          );
        })}
      </div>

      {/* New notebook */}
      <div className="flex-none p-2 border-t border-[var(--color-hairline-soft)]">
        <button
          onClick={() => window.dispatchEvent(new Event("justnoted:new-notebook"))}
          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-[var(--radius-8)] border border-dashed border-[var(--color-border-control)] text-[13px] text-[var(--color-ink-3)] hover:bg-[var(--color-accent-tint)] hover:text-[var(--color-accent-text)] hover:border-[var(--color-accent-text)] transition-colors"
        >
          <IconPlus size={15} /> New notebook
        </button>
      </div>
    </div>
  );
}
