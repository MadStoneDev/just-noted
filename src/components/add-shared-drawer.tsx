"use client";

import React, { useState } from "react";
import { saveSharedNotesByLinks, type SaveLinkResult } from "@/app/actions/sharing";
import {
  IconX,
  IconLink,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";

interface AddSharedDrawerProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Full-width bottom drawer for adding shared notes by link or code. Supports a
 * single entry or bulk (one per line). Slides up over the whole screen, sized
 * to its content — deliberately not confined to the sidebar width.
 */
export default function AddSharedDrawer({ open, onClose, onAdded }: AddSharedDrawerProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<SaveLinkResult[] | null>(null);

  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const close = () => {
    onClose();
    // Reset after the slide-out finishes.
    setTimeout(() => {
      setValue("");
      setResults(null);
      setMode("single");
    }, 300);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;
    setSubmitting(true);
    const res = await saveSharedNotesByLinks(lines);
    setSubmitting(false);
    setResults(res.results || []);
    if ((res.results || []).some((r) => r.success)) onAdded();
  };

  const addedCount = results?.filter((r) => r.success).length ?? 0;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-[var(--color-bg-overlay)] transition-opacity duration-[var(--duration-normal)] ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />
      <div
        className={`relative w-full max-w-2xl bg-[var(--color-raised)] border-t border-[var(--color-hairline)] rounded-t-[var(--radius-xl)] shadow-[var(--shadow-lg)] flex flex-col max-h-[85vh] transition-transform duration-[var(--duration-slow)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-[var(--color-hairline)]" />
        <div className="flex items-center justify-between px-4 py-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink-1)]">Add shared notes</h3>
          <button
            onClick={close}
            className="text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)]"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="overflow-y-auto scrollbar-thin px-4 pb-5 pt-1 space-y-3">
          {/* Single / bulk toggle */}
          <div className="inline-flex gap-1 p-0.5 bg-[var(--color-raised-soft)] rounded-[var(--radius-md)]">
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setResults(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
                  mode === m
                    ? "bg-[var(--color-raised)] shadow-sm text-[var(--color-ink-1)]"
                    : "text-[var(--color-ink-5)] hover:text-[var(--color-ink-3)]"
                }`}
              >
                {m === "single" ? "One link" : "Bulk"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-2">
            {mode === "single" ? (
              <div className="flex items-center gap-2 bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] px-3">
                <IconLink size={15} className="text-[var(--color-ink-5)] flex-none" />
                <input
                  autoFocus
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setResults(null);
                  }}
                  placeholder="Paste a share link or code…"
                  className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)]"
                />
              </div>
            ) : (
              <textarea
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setResults(null);
                }}
                rows={6}
                placeholder={"One link or code per line…\nhttps://justnoted.app/n/AbC123xyz\nAbC123xyz"}
                className="w-full bg-[var(--color-raised-soft)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm outline-none text-[var(--color-ink-1)] placeholder:text-[var(--color-ink-5)] resize-y font-mono leading-relaxed"
              />
            )}
            <p className="text-[11px] text-[var(--color-ink-5)]">
              Accepts full links, <code>/n/</code> paths, or bare share codes.
            </p>
            <button
              type="submit"
              disabled={submitting || lines.length === 0}
              className="w-full py-2.5 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors disabled:opacity-50"
            >
              {submitting
                ? "Checking…"
                : lines.length > 1
                  ? `Add ${lines.length} notes`
                  : "Add note"}
            </button>
          </form>

          {results && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)]">
                {addedCount} added{results.length - addedCount > 0 ? `, ${results.length - addedCount} skipped` : ""}
              </div>
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {r.success ? (
                    <IconCheck size={15} className="mt-[1px] text-[var(--color-success)] flex-none" />
                  ) : (
                    <IconAlertTriangle size={15} className="mt-[1px] text-[var(--color-danger)] flex-none" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[var(--color-ink-1)]">
                      {r.success ? r.title || "Added" : r.input}
                    </div>
                    {!r.success && <div className="text-[var(--color-danger)]">{r.error}</div>}
                  </div>
                </div>
              ))}
              <button
                onClick={close}
                className="w-full mt-2 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-raised-soft)] text-[var(--color-ink-3)] hover:bg-[var(--color-raised-soft)] transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
