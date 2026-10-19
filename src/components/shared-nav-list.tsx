"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSharedWithMe,
  getSharedByMe,
  unsaveSharedNote,
  saveSharedNoteByLink,
  setSharedNotePinned,
  setSharedNoteHidden,
  type SharedListItem,
} from "@/app/actions/sharing";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ds/dropdown";
import {
  IconLoader2,
  IconWorld,
  IconLock,
  IconEye,
  IconEyeOff,
  IconUser,
  IconShare,
  IconPlus,
  IconDots,
  IconPinnedFilled,
  IconChevronDown,
} from "@tabler/icons-react";

type SharedSort = "recent" | "title";

type Tab = "withme" | "byme" | "saved";

interface SharedNavListProps {
  onOpen: (shortcode: string) => void;
  /** Open an owned note in the owner's normal editor (by note id). */
  onOpenOwned?: (noteId: string) => void;
  /** Shortcode of the shared note currently open, for the active highlight. */
  activeShortcode?: string | null;
  /** Id of the owned note currently open (By me tab active highlight). */
  activeNoteId?: string | null;
}

function PermTag({ perm, asLink }: { perm?: string; asLink?: boolean }) {
  const canEdit = perm === "edit";
  // asLink makes clear this is what the LINK grants, not the viewer's own role —
  // an owned note shows "Owner", never "can view".
  const label = asLink ? (canEdit ? "link: edit" : "link: view") : canEdit ? "can edit" : "can view";
  return (
    <span
      className={`shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] ${
        canEdit
          ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]"
          : "border border-[var(--color-border-control)] text-[var(--color-ink-4)]"
      }`}
    >
      {label}
    </span>
  );
}

function OwnerTag() {
  return (
    <span className="shrink-0 text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]">
      Owner
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
export default function SharedNavList({ onOpen, onOpenOwned, activeShortcode, activeNoteId }: SharedNavListProps) {
  const [items, setItems] = useState<SharedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("withme");
  const [linkInput, setLinkInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortBy, setSortBy] = useState<SharedSort>("recent");
  const [showHidden, setShowHidden] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [withMe, byMe] = await Promise.all([getSharedWithMe(), getSharedByMe()]);
    setItems([...(withMe.success ? withMe.notes : []), ...(byMe.success ? byMe.notes : [])]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // On first load, surface the sub-tab that actually contains the open note so
  // its active highlight is visible — otherwise a restored shared note that
  // lives under "By me" or "Saved" looks unselected on the default "With me"
  // tab. Runs once; later manual tab changes are left alone.
  const autoTabRef = useRef(false);
  useEffect(() => {
    if (loading || autoTabRef.current) return;
    autoTabRef.current = true;
    const active = items.find((i) =>
      i.source === "owned"
        ? !!activeNoteId && i.noteId === activeNoteId
        : !!activeShortcode && i.shortcode === activeShortcode,
    );
    if (active) {
      setTab(active.source === "owned" ? "byme" : active.source === "saved" ? "saved" : "withme");
    }
  }, [loading, items, activeShortcode, activeNoteId]);

  const byTab = useMemo(() => {
    const src = tab === "withme" ? "granted" : tab === "byme" ? "owned" : "saved";
    let arr = items.filter((i) => i.source === src);
    // Granted notes can be hidden by the recipient; keep them out unless the
    // "Show hidden" toggle is on. (Saved notes are removed, never hidden.)
    if (src === "granted" && !showHidden) arr = arr.filter((i) => !i.hidden);
    return [...arr].sort((a, b) => {
      // Pinned always first (recipient org — no-op on the owner's "By me" tab).
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta || a.title.localeCompare(b.title);
    });
  }, [items, tab, sortBy, showHidden]);

  const withMeCount = items.filter((i) => i.source === "granted").length;
  const hiddenGrantedCount = items.filter((i) => i.source === "granted" && i.hidden).length;

  const handleRemove = async (shortcode: string) => {
    setItems((prev) => prev.filter((i) => !(i.source === "saved" && i.shortcode === shortcode)));
    await unsaveSharedNote(shortcode);
    load();
  };

  // Optimistically flip pin, then persist (reload to resync on failure).
  const handleTogglePin = async (n: SharedListItem) => {
    const source = n.source === "saved" ? "saved" : "granted";
    const next = !n.pinned;
    setItems((prev) =>
      prev.map((i) =>
        i.source === n.source && i.shortcode === n.shortcode ? { ...i, pinned: next } : i,
      ),
    );
    const res = await setSharedNotePinned(n.shortcode, source, next);
    if (!res.success) load();
  };

  // Hide/unhide a granted note (recipient's view only).
  const handleHide = async (shortcode: string, hidden: boolean) => {
    setItems((prev) =>
      prev.map((i) =>
        i.source === "granted" && i.shortcode === shortcode ? { ...i, hidden } : i,
      ),
    );
    const res = await setSharedNoteHidden(shortcode, hidden);
    if (!res.success) load();
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

      {/* Sort + show-hidden toolbar */}
      <div className="flex-none flex items-center justify-between gap-2 px-2 py-1.5">
        <Dropdown
          placement="bottom-start"
          trigger={
            <button className="flex items-center gap-1 px-2 h-7 rounded-[var(--radius-6)] text-[12px] border border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors">
              {sortBy === "title" ? "Title" : "Recent"}
              <IconChevronDown size={12} className="opacity-60" />
            </button>
          }
        >
          <DropdownItem onClick={() => setSortBy("recent")}>Recent</DropdownItem>
          <DropdownItem onClick={() => setSortBy("title")}>Title</DropdownItem>
        </Dropdown>

        {tab === "withme" && hiddenGrantedCount > 0 && (
          <button
            onClick={() => setShowHidden((s) => !s)}
            className={`flex items-center gap-1 px-2 h-7 rounded-[var(--radius-6)] text-[12px] border transition-colors ${
              showHidden
                ? "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                : "border-[var(--color-border-control)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)]"
            }`}
          >
            {showHidden ? <IconEye size={13} /> : <IconEyeOff size={13} />}
            {showHidden ? "Hide hidden" : `Show hidden (${hiddenGrantedCount})`}
          </button>
        )}
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
            byTab.map((n) => {
              // Mirror the own-note list's active treatment: an owned note (By
              // me tab) matches the open note id; a granted/saved note matches
              // the open shared shortcode.
              const isActive =
                n.source === "owned"
                  ? !!activeNoteId && n.noteId === activeNoteId
                  : !!activeShortcode && n.shortcode === activeShortcode;
              return (
              <div key={n.source + n.shortcode} className="group/sh relative">
                <button
                  onClick={() => {
                    // An owned note opens in the owner's own editor — opening it
                    // via the shared-link path would check access as a recipient
                    // and (correctly) refuse (A3).
                    if (n.source === "owned" && n.noteId && onOpenOwned) onOpenOwned(n.noteId);
                    else onOpen(n.shortcode);
                  }}
                  className={`group/note relative w-full text-left px-2.5 py-3 md:px-2 md:py-2 rounded-[var(--radius-8)] border transition-colors duration-[var(--duration-fast)] ${
                    isActive
                      ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]"
                      : "border-transparent hover:bg-[var(--color-raised-soft)]"
                  } ${n.hidden ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="mt-[3px] flex-shrink-0">
                      {tab === "byme" ? (
                        n.isPublic ? <IconWorld size={13} className="text-[var(--color-info)]" /> : <IconLock size={13} className="text-[var(--color-ink-5)]" />
                      ) : (
                        <IconUser size={13} className="text-[var(--color-ink-5)]" />
                      )}
                    </span>
                    <div className={`flex-1 min-w-0 ${tab !== "byme" ? "pr-5" : ""}`}>
                      {/* Title wraps like the own-note cards instead of being
                          truncated and squeezed by an inline badge. */}
                      <h3 className="text-[16px] md:text-[13px] font-medium text-[var(--color-ink-1)] leading-snug whitespace-normal break-words">
                        {n.pinned && (
                          <IconPinnedFilled
                            size={12}
                            className="inline-block mr-1 align-[-1px] text-[var(--color-accent-text)]"
                          />
                        )}
                        {n.title}
                      </h3>
                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        {tab === "byme" ? (
                          <>
                            <span className="text-[12px] text-[var(--color-ink-5)]">{n.isPublic ? "Public link" : `${n.readerCount} ${n.readerCount === 1 ? "person" : "people"}`}</span>
                            <span className="inline-flex items-center gap-0.5 text-[12px] text-[var(--color-ink-5)]">
                              <IconEye size={12} />
                              {n.viewCount}
                            </span>
                            <OwnerTag />
                            {n.isPublic && <PermTag perm={n.linkPermission} asLink />}
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <OwnerAvatar name={n.owner} url={n.ownerAvatar} />
                              <span className="truncate text-[12px] text-[var(--color-ink-5)]">{n.owner}</span>
                            </span>
                            <PermTag perm={n.linkPermission} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                {tab !== "byme" && (
                  <div className="absolute top-2 right-1 opacity-0 group-hover/sh:opacity-100 transition-opacity">
                    <Dropdown
                      placement="bottom-end"
                      trigger={
                        <button
                          title="More"
                          className="p-1 rounded text-[var(--color-ink-5)] hover:text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                        >
                          <IconDots size={14} />
                        </button>
                      }
                    >
                      <DropdownItem onClick={() => handleTogglePin(n)}>
                        {n.pinned ? "Unpin" : "Pin"}
                      </DropdownItem>
                      {tab === "withme" && (
                        <DropdownItem onClick={() => handleHide(n.shortcode, !n.hidden)}>
                          {n.hidden ? "Unhide" : "Hide"}
                        </DropdownItem>
                      )}
                      {tab === "saved" && (
                        <DropdownItem destructive onClick={() => handleRemove(n.shortcode)}>
                          Remove from my shared notes
                        </DropdownItem>
                      )}
                    </Dropdown>
                  </div>
                )}
              </div>
              );
            })
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
