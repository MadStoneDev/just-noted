"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  getSharedWithMe,
  getSharedByMe,
  unsaveSharedNote,
  type SharedListItem,
  type SharedSource,
} from "@/app/actions/sharing";
import AddSharedDrawer from "@/components/add-shared-drawer";
import {
  IconLoader2,
  IconWorld,
  IconLock,
  IconEye,
  IconUser,
  IconUsers,
  IconShare2,
  IconPlus,
  IconX,
  IconBookmark,
  IconSend,
  IconLayoutGrid,
} from "@tabler/icons-react";

type Filter = "all" | "granted" | "saved" | "owned";

interface SharedNavListProps {
  onOpen: (shortcode: string) => void;
}

/**
 * Sidebar "Shared" view: granted ("Shared with you"), saved ("Added by you"),
 * and owned ("Shared by you"), with an icon filter and a full-width add drawer.
 */
export default function SharedNavList({ onOpen }: SharedNavListProps) {
  const [items, setItems] = useState<SharedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);

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

  const handleRemove = async (shortcode: string) => {
    setItems((prev) => prev.filter((i) => !(i.source === "saved" && i.shortcode === shortcode)));
    await unsaveSharedNote(shortcode);
    load();
  };

  const filters: { key: Filter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All shared", icon: <IconLayoutGrid size={17} /> },
    { key: "granted", label: "Shared with you", icon: <IconUsers size={17} /> },
    { key: "saved", label: "Added by you", icon: <IconBookmark size={17} /> },
    { key: "owned", label: "Shared by you", icon: <IconSend size={17} /> },
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
      {/* Toolbar: icon filters + add */}
      <div className="flex-none flex items-center gap-1 px-2 py-2 border-b border-[var(--color-border-secondary)]">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            title={f.label}
            aria-label={f.label}
            className={`w-9 h-8 flex items-center justify-center rounded-[var(--radius-md)] transition-colors ${
              filter === f.key
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {f.icon}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setAddOpen(true)}
          title="Add by link"
          aria-label="Add by link"
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors"
        >
          <IconPlus size={16} />
          Add
        </button>
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
                Share a note, or add one you received with &ldquo;Add.&rdquo;
              </p>
            </div>
          )}
        </div>
      )}

      <AddSharedDrawer open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </div>
  );
}
