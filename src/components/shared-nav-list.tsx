"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  getSharedWithMe,
  getSharedByMe,
  saveSharedNoteByLink,
  unsaveSharedNote,
  type SharedListItem,
  type SharedSource,
} from "@/app/actions/sharing";
import {
  IconLoader2,
  IconWorld,
  IconLock,
  IconEye,
  IconUser,
  IconShare2,
  IconPlus,
  IconX,
  IconBookmark,
  IconLink,
} from "@tabler/icons-react";

type Filter = "all" | "granted" | "saved" | "owned";

interface SharedNavListProps {
  /** Open a shared note read-only inside the app. */
  onOpen: (shortcode: string) => void;
}

/**
 * Sidebar "Shared" view. Three categories:
 *   - granted → "Shared with you" (an owner added you as a reader)
 *   - saved   → "Added by you" (you bookmarked a link)
 *   - owned   → "Shared by you" (notes you shared out)
 * plus a filter toggle and an "Add by link" action.
 */
export default function SharedNavList({ onOpen }: SharedNavListProps) {
  const [items, setItems] = useState<SharedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [withMe, byMe] = await Promise.all([getSharedWithMe(), getSharedByMe()]);
    setItems([
      ...(withMe.success ? withMe.notes : []),
      ...(byMe.success ? byMe.notes : []),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setAdding(true);
    setAddError(null);
    const res = await saveSharedNoteByLink(link.trim());
    setAdding(false);
    if (res.success) {
      setLink("");
      setAddOpen(false);
      setFilter("saved");
      await load();
    } else {
      setAddError(res.error || "Couldn't add that link.");
    }
  };

  const handleRemove = async (shortcode: string) => {
    setItems((prev) => prev.filter((i) => !(i.source === "saved" && i.shortcode === shortcode)));
    await unsaveSharedNote(shortcode);
    load();
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "granted", label: "With you" },
    { key: "saved", label: "Added" },
    { key: "owned", label: "By you" },
  ];

  const groups: { key: SharedSource; label: string }[] = [
    { key: "granted", label: "Shared with you" },
    { key: "saved", label: "Added by you" },
    { key: "owned", label: "Shared by you" },
  ];
  const visibleGroups = filter === "all" ? groups : groups.filter((g) => g.key === filter);
  const visibleCount = items.filter((i) => filter === "all" || i.source === filter).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar: filter + add-by-link */}
      <div className="flex-none px-2 pt-2 pb-1.5 border-b border-[var(--color-border-secondary)] space-y-2">
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 px-1 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors ${
                filter === f.key
                  ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                  : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {addOpen ? (
          <form onSubmit={handleAdd} className="space-y-1.5">
            <div className="flex items-center gap-1.5 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] px-2">
              <IconLink size={14} className="text-[var(--color-text-tertiary)] flex-none" />
              <input
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Paste a share link…"
                className="flex-1 min-w-0 bg-transparent py-2 text-[13px] outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
              />
            </div>
            {addError && <p className="text-[11px] text-[var(--color-danger)] px-1">{addError}</p>}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={adding || !link.trim()}
                className="flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {adding ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setAddError(null);
                  setLink("");
                }}
                className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-primary)] text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] hover:border-[var(--color-accent)] transition-colors"
          >
            <IconPlus size={14} /> Add by link
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-tertiary)]">
          <IconLoader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
          {visibleGroups.map((g) => {
            const rows = items.filter((i) => i.source === g.key);
            if (rows.length === 0) return null;
            return (
              <div key={g.key} className="mb-1">
                <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {g.label}
                </div>
                {rows.map((n) => (
                  <div key={g.key + n.shortcode} className="group/sh relative">
                    <button
                      onClick={() => onOpen(n.shortcode)}
                      className="w-full text-left flex items-start gap-2 px-2 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
                    >
                      <span className="mt-[3px] flex-shrink-0">
                        {g.key === "owned" ? (
                          n.isPublic ? (
                            <IconWorld size={14} className="text-[var(--color-info)]" />
                          ) : (
                            <IconLock size={14} className="text-[var(--color-text-tertiary)]" />
                          )
                        ) : g.key === "saved" ? (
                          <IconBookmark size={14} className="text-[var(--color-text-tertiary)]" />
                        ) : (
                          <IconUser size={14} className="text-[var(--color-text-tertiary)]" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-sm text-[var(--color-text-primary)] break-words">{n.title}</div>
                        <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 flex items-center gap-2">
                          {g.key === "owned" ? (
                            <>
                              <span>
                                {n.isPublic
                                  ? "Public link"
                                  : `${n.readerCount} ${n.readerCount === 1 ? "person" : "people"}`}
                              </span>
                              <span className="inline-flex items-center gap-0.5">
                                <IconEye size={11} />
                                {n.viewCount}
                              </span>
                            </>
                          ) : (
                            <span>from {n.owner}</span>
                          )}
                        </div>
                      </div>
                    </button>
                    {g.key === "saved" && (
                      <button
                        onClick={() => handleRemove(n.shortcode)}
                        title="Remove from your list"
                        className="absolute top-2 right-1 p-1 rounded text-[var(--color-text-tertiary)] opacity-0 group-hover/sh:opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--color-hover)] transition-opacity"
                      >
                        <IconX size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {visibleCount === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
              <IconShare2 size={22} className="text-[var(--color-text-tertiary)]" />
              <p className="text-sm text-[var(--color-text-tertiary)]">Nothing here yet</p>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                Share a note, or add one you received with &ldquo;Add by link&rdquo;.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
