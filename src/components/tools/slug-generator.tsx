"use client";

import React, { useState, useMemo } from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { slugify, slugifyLines } from "@/lib/text-tools/slug";

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return { copied, copy };
}

export default function SlugGenerator() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [removeFiller, setRemoveFiller] = useState(false);
  const [maxLength, setMaxLength] = useState<string>("");
  const [single, setSingle] = useState("");
  const [batch, setBatch] = useState("");
  const { copied, copy } = useCopy();

  const opts = useMemo(
    () => ({ removeFillerWords: removeFiller, maxLength: parseInt(maxLength) || 0 }),
    [removeFiller, maxLength],
  );

  const singleOut = useMemo(() => slugify(single, opts), [single, opts]);
  const batchOut = useMemo(() => slugifyLines(batch, opts), [batch, opts]);
  const output = mode === "single" ? singleOut : batchOut;

  return (
    <div className="space-y-5">
      {/* Mode + options */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="inline-flex rounded-[var(--radius-7)] border border-[var(--color-border-control)] p-0.5">
          {(["single", "batch"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 h-7 rounded-[var(--radius-6)] text-[12.5px] font-medium transition-colors ${
                mode === m
                  ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                  : "text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)]"
              }`}
            >
              {m === "single" ? "Single" : "Batch"}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={removeFiller}
            onChange={(e) => setRemoveFiller(e.target.checked)}
            className="accent-[var(--color-accent-fill)]"
          />
          Remove filler words
        </label>

        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-2)]">
          Max length
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="none"
            className="w-20 h-8 px-2 text-[13px] bg-[var(--color-bg-primary)] border border-[var(--color-border-control)] rounded-[var(--radius-7)] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
      </div>

      {/* Input */}
      {mode === "single" ? (
        <input
          autoFocus
          value={single}
          onChange={(e) => setSingle(e.target.value)}
          placeholder="Type a title…"
          className="w-full h-11 px-3.5 text-[15px] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      ) : (
        <textarea
          autoFocus
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="One title per line…"
          rows={6}
          className="w-full px-3.5 py-2.5 text-[14px] leading-relaxed resize-y bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      )}

      {/* Output */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
            {mode === "single" ? "Slug" : "Slugs"}
          </span>
          <button
            onClick={() => copy(output)}
            disabled={!output}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-6)] text-[12px] font-medium text-[var(--color-ink-2)] border border-[var(--color-border-control)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
          >
            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            {copied ? "Copied" : mode === "single" ? "Copy" : "Copy all"}
          </button>
        </div>
        <div className="min-h-[44px] px-3.5 py-2.5 rounded-[var(--radius-lg)] bg-[var(--color-raised-soft)] border border-[var(--color-hairline)] font-mono text-[13.5px] text-[var(--color-ink-1)] break-all whitespace-pre-wrap">
          {output || <span className="text-[var(--color-ink-6)]">—</span>}
        </div>
      </div>
    </div>
  );
}
