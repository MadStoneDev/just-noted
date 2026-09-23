"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconX, IconLoader2, IconCopy, IconCheck } from "@tabler/icons-react";
import { sharingOperation } from "@/app/actions/sharing";

interface Version { id: string; createdAt: string; author: string; content: string }

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/**
 * Version history for a shared note (design surface 05). A 320px right panel.
 * Collaborators get "Copy version" (read-only); the owner restores from their
 * own editor. Content comes from the server (getSharedVersions), access-checked.
 */
export function SharedHistoryPanel({ shortcode, onClose }: { shortcode: string; onClose: () => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = (await sharingOperation({ operation: "getSharedVersions", shortcode })) as any;
      if (!alive) return;
      setVersions(res?.success ? res.versions : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [shortcode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (v: Version) => {
    navigator.clipboard.writeText(v.content);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId((c) => (c === v.id ? null : c)), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex justify-end">
      <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" onClick={onClose} />
      <aside className="relative w-[320px] max-w-[90vw] h-full flex flex-col bg-[var(--color-panel-alt)] border-l border-[var(--color-hairline)] shadow-[var(--shadow-lg)]">
        <div className="flex-none flex items-center justify-between h-11 px-4 border-b border-[var(--color-hairline-soft)]">
          <span className="text-[13.5px] font-semibold text-[var(--color-ink-1)]">Version history</span>
          <button onClick={onClose} aria-label="Close" className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)]">
            <kbd className="px-1 py-0.5 rounded-[var(--radius-4)] border border-[var(--color-border-control)]">esc</kbd>
            <IconX size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-ink-5)]"><IconLoader2 size={18} className="animate-spin" /></div>
          ) : versions.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12.5px] text-[var(--color-ink-5)]">No saved versions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {versions.map((v, i) => (
                <li key={v.id} className="rounded-[var(--radius-9)] border border-[var(--color-hairline)] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-[var(--color-ink-1)] truncate">@{v.author}</span>
                    <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-4)] shrink-0">
                      {relTime(v.createdAt)}{i === 0 ? " · current" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => copy(v)}
                    className="mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                  >
                    {copiedId === v.id ? <IconCheck size={13} /> : <IconCopy size={13} />}
                    {copiedId === v.id ? "Copied" : "Copy version"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
