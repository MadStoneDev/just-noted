"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSharedWithMe,
  getSharedByMe,
  unsaveSharedNote,
  saveSharedNoteByLink,
  type SharedListItem,
} from "@/app/actions/sharing";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import {
  IconLoader2,
  IconWorld,
  IconLock,
  IconEye,
  IconUser,
  IconShare,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

type Tab = "withme" | "byme" | "saved";

interface SharedNavListProps {
  onOpen: (shortcode: string) => void;
}

function PermTag({ perm }: { perm?: string }) {
  const canEdit = perm === "edit";
  return (
    <span
      className={`shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] ${
        canEdit
          ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]"
          : "border border-[var(--color-border-control)] text-[var(--color-ink-4)]"
      }`}
    >
      {canEdit ? "can edit" : "can view"}
    </span>
  );
}

function OwnerAvatar({ name, url }: { name?: string; url?: string | null }) {
  return <Avatar url={url} name={name} size={18} />;
}

/**
 * Sidebar "Shared" view (design surface 05): three tabs — With me · By me ·
 * Saved. Notes shared with you land here automatically. Below the list, a
 * "Paste a link" field adds notes shared from outside the app.
 */
export default function SharedNavList({ onOpen }: SharedNavListProps) {
  const [items, setItems] = useState<SharedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("withme");
  const [linkInput, setLinkInput] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [withMe, byMe] = await Promise.all([getSharedWithMe(), getSharedByMe()]);
    setItems([...(withMe.success ? withMe.notes : []), ...(byMe.success ? byMe.notes : [])]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byTab = useMemo(() => {
    const src = tab === "withme" ? "granted" : tab === "byme" ? "owned" : "saved";
    const arr = items.filter((i) => i.source === src);
    arr.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta || a.title.localeCompare(b.title);
    });
    return arr;
  }, [items, tab]);

  const withMeCount = items.filter((i) => i.source === "granted").length;

  const handleRemove = async (shortcode: string) => {
    setItems((prev) => prev.filter((i) => !(i.source === "saved" && i.shortcode === shortcode)));
    await unsaveSharedNote(shortcode);
    load();
  };

  const handleAddLink = async () => {
    const input = linkInput.trim();
    if (!input) return;
    setAdding(true);
    const res = await saveSharedNoteByLink(input);
    setAdding(false);
    if (res.success) {
      setLinkInput("");
      toast.showSuccess(res.title ? `Added “${res.title}”` : "Added to your shared notes");
      setTab("saved");
      load();
    } else {
      toast.showError(res.error || "Couldn't add that link");
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "withme", label: "With me", count: withMeCount },
    { key: "byme", label: "By me" },
    { key: "saved", label: "Saved" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tabs */}
      <div className="flex-none flex items-stretch gap-1 px-2 pt-2 border-b border-[var(--color-hairline-soft)]">
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-2.5 pb-2 text-[13px] font-medium transition-colors ${
                on ? "text-[var(--color-ink-1)]" : "text-[var(--color-ink-5)] hover:text-[var(--color-ink-2)]"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-accent-text)]">{t.count}</span>
                )}
              </span>
              {on && <span className="absolute left-1 right-1 -bottom-px h-0.5 rounded-full bg-[var(--color-accent-fill)]" />}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-ink-5)]">
          <IconLoader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
          {byTab.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <IconShare size={22} className="text-[var(--color-ink-5)]" />
              <p className="text-[13px] text-[var(--color-ink-4)]">
                {tab === "withme" ? "Nothing shared with you yet" : tab === "byme" ? "You haven't shared anything" : "No saved links"}
              </p>
              <p className="text-[11px] text-[var(--color-ink-5)]">
                {tab === "saved" ? "Paste a link below to add one." : "Notes shared with you appear here automatically."}
              </p>
            </div>
          ) : (
            byTab.map((n) => (
              <div key={n.source + n.shortcode} className="group/sh relative">
                <button
                  onClick={() => onOpen(n.shortcode)}
                  className="w-full text-left flex items-start gap-2 px-2 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-raised-soft)] transition-colors"
                >
                  <span className="mt-[3px] flex-shrink-0">
                    {tab === "byme" ? (
                      n.isPublic ? <IconWorld size={14} className="text-[var(--color-info)]" /> : <IconLock size={14} className="text-[var(--color-ink-5)]" />
                    ) : (
                      <IconUser size={14} className="text-[var(--color-ink-5)]" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-sm text-[var(--color-ink-1)] truncate">{n.title}</span>
                      {tab !== "byme" && <PermTag perm={n.linkPermission} />}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-5)] mt-1 flex items-center gap-1.5">
                      {tab === "byme" ? (
                        <>
                          <span>{n.isPublic ? "Public link" : `${n.readerCount} ${n.readerCount === 1 ? "person" : "people"}`}</span>
                          <span className="inline-flex items-center gap-0.5">
                            <IconEye size={11} />
                            {n.viewCount}
                          </span>
                          <PermTag perm={n.linkPermission} />
                        </>
                      ) : (
                        <>
                          <OwnerAvatar name={n.owner} url={n.ownerAvatar} />
                          <span className="truncate">{n.owner}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                {tab === "saved" && (
                  <button
                    onClick={() => handleRemove(n.shortcode)}
                    title="Remove from your list"
                    className="absolute top-2 right-1 p-1 rounded text-[var(--color-ink-5)] opacity-0 group-hover/sh:opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)] transition-opacity"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Paste a link — the surviving "Add" affordance for out-of-app shares */}
      <div className="flex-none border-t border-[var(--color-hairline-soft)] p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
            placeholder="Paste a link — justnoted.app/n/…"
            className="flex-1 h-9 px-3 text-[12.5px] bg-[var(--color-raised-soft)] border border-transparent rounded-[var(--radius-8)] text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] focus:border-[var(--color-accent-fill)] focus:bg-[var(--color-raised)] focus:outline-none transition-colors"
          />
          <button
            onClick={handleAddLink}
            disabled={adding || !linkInput.trim()}
            className="h-9 px-3 flex items-center gap-1 text-[13px] font-medium rounded-[var(--radius-8)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {adding ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlus size={14} />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
