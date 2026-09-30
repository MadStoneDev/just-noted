"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getVersions } from "@/app/actions/versionActions";
import { IconHistory, IconX, IconArrowBackUp, IconCalendar, IconSparkles } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ds/modal";

interface Version {
  id: string;
  title: string;
  content: string;
  content_format: string;
  created_at: string;
}

interface VersionHistoryPanelProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string, title: string) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function VersionHistoryPanel({ noteId, open, onClose, onRestore }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Version | null>(null);
  // Date/time range filter — a Scribe feature. canFilter comes back from the
  // server (the source of truth for the gate); Draft still sees every version.
  const [canFilter, setCanFilter] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const range =
        rangeFrom || rangeTo
          ? {
              from: rangeFrom ? new Date(rangeFrom).toISOString() : null,
              to: rangeTo ? new Date(rangeTo).toISOString() : null,
            }
          : undefined;
      const result = await getVersions(noteId, range);
      if (result.success) setVersions(result.versions);
      setCanFilter(!!result.canFilter);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [noteId, rangeFrom, rangeTo]);

  useEffect(() => {
    if (open) loadVersions();
  }, [open, loadVersions]);

  const previewVersion = previewId ? versions.find((v) => v.id === previewId) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" />

      <div className="relative ml-auto w-full max-w-md h-full bg-[var(--color-bg-elevated)] border-l border-[var(--color-border-secondary)] shadow-lg flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center gap-2">
            <IconHistory size={16} className="text-[var(--color-text-tertiary)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Version History</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {previewVersion ? (
            <>
              {/* Preview */}
              <div className="px-4 py-2 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">{previewVersion.title}</p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)]">{relativeTime(previewVersion.created_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setConfirmRestore(previewVersion)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-hover)] transition-colors"
                  >
                    <IconArrowBackUp size={12} />
                    Restore
                  </button>
                  <button
                    onClick={() => setPreviewId(null)}
                    className="px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-sm)] transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
                <div className="milkdown text-sm whitespace-pre-wrap text-[var(--color-text-secondary)]">
                  {previewVersion.content}
                </div>
              </div>
            </>
          ) : (
            <>
            {loadedOnce && (canFilter ? (
              <div className="px-4 py-2 border-b border-[var(--color-border-secondary)] flex items-center gap-1.5 flex-wrap">
                <IconCalendar size={12} className="text-[var(--color-text-tertiary)] shrink-0" />
                <input
                  type="datetime-local"
                  aria-label="From date"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="min-w-0 flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-[var(--color-border-secondary)] rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
                <span className="text-[10px] text-[var(--color-text-tertiary)]">–</span>
                <input
                  type="datetime-local"
                  aria-label="To date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="min-w-0 flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-[var(--color-border-secondary)] rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
                {(rangeFrom || rangeTo) && (
                  <button
                    onClick={() => { setRangeFrom(""); setRangeTo(""); }}
                    className="px-1.5 py-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <a
                href="/pricing?ref=history-filter"
                className="px-4 py-2 border-b border-[var(--color-border-secondary)] flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <IconSparkles size={12} className="shrink-0" />
                Filter history by date range — a Scribe feature
              </a>
            ))}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--color-text-tertiary)]">No versions yet</p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Versions are saved automatically as you edit</p>
                </div>
              ) : (
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}>
                      <button
                        onClick={() => setPreviewId(version.id)}
                        className="w-full text-left px-4 py-3 border-b border-[var(--color-border-secondary)] hover:bg-[var(--color-hover)] transition-colors"
                      >
                        <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{version.title}</p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">{relativeTime(version.created_at)}</p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)] truncate mt-1">
                          {version.content?.slice(0, 100)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
          )}
        </div>

        <ConfirmModal
          open={!!confirmRestore}
          onClose={() => setConfirmRestore(null)}
          onConfirm={() => {
            if (confirmRestore) {
              onRestore(confirmRestore.content, confirmRestore.title);
              setConfirmRestore(null);
              onClose();
            }
          }}
          title="Restore version"
          message="This will replace your current note content with this version. Continue?"
          confirmText="Restore"
        />
      </div>
    </div>
  );
}
