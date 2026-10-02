"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { slugifyDetailed, slugifyBatch } from "@/lib/text-tools/slug";
import CopyButton from "@/components/tools/ui/copy-button";
import Notice from "@/components/tools/ui/notice";
import { Toggle, Stepper } from "@/components/tools/ui/controls";

const OPTS_KEY = "jn.tools.slug-generator.options";

interface Opts { removeFiller: boolean; maxLength: number; batch: boolean }
const DEFAULTS: Opts = { removeFiller: true, maxLength: 60, batch: false };

export default function SlugGenerator() {
  const [opts, setOpts] = useState<Opts>(DEFAULTS);
  const [single, setSingle] = useState("");
  const [batch, setBatch] = useState("");
  const [pasteOffer, setPasteOffer] = useState<string | null>(null);

  // Persist options per tool (§12).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPTS_KEY);
      if (raw) setOpts({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  const update = (patch: Partial<Opts>) => {
    setOpts((o) => {
      const next = { ...o, ...patch };
      try { localStorage.setItem(OPTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const libOpts = { removeFillerWords: opts.removeFiller, maxLength: opts.maxLength };
  const result = useMemo(() => slugifyDetailed(single, libOpts), [single, opts.removeFiller, opts.maxLength]);
  const noLatin = single.trim() !== "" && result.slug === "";
  // Words dropped by the length trim (for the warning).
  const trimDropped = useMemo(() => {
    if (!result.trimmed) return [] as string[];
    const full = slugifyDetailed(single, { removeFillerWords: opts.removeFiller, maxLength: 0 }).slug;
    const kept = new Set(result.slug.split("-"));
    return full.split("-").filter((w) => w && !kept.has(w));
  }, [result, single, opts.removeFiller]);

  const batchResult = useMemo(() => slugifyBatch(batch, libOpts), [batch, opts.removeFiller, opts.maxLength]);
  const batchCopyText = batchResult.outputs.join("\n");

  // Synced scroll for the batch two-column layout.
  const inRef = useRef<HTMLTextAreaElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const syncScroll = (from: "in" | "out") => {
    const a = from === "in" ? inRef.current : outRef.current;
    const b = from === "in" ? outRef.current : inRef.current;
    if (a && b) b.scrollTop = a.scrollTop;
  };

  const counter = opts.maxLength > 0 ? `${result.slug.length} / ${opts.maxLength}` : `${result.slug.length}`;

  return (
    <div className="space-y-5">
      {!opts.batch ? (
        <>
          {/* Title */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="slug-title" className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Title</label>
              <Toggle size="inline" checked={opts.batch} onChange={(v) => update({ batch: v })} label="Batch mode" />
            </div>
            <input
              id="slug-title"
              autoFocus
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.includes("\n")) {
                  e.preventDefault();
                  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
                  setSingle(text.split(/\r?\n/)[0]);
                  if (lines.length > 1) setPasteOffer(text);
                }
              }}
              placeholder="Paste or type a title"
              className="w-full h-[54px] px-4 text-[17px] bg-[var(--color-raised)] border border-[var(--color-border-control)] rounded-[var(--radius-10)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent-deep)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-accent-fill)]/15"
            />
          </div>

          {pasteOffer && (
            <Notice
              level="info"
              action={{ label: "Switch", onClick: () => { update({ batch: true }); setBatch(pasteOffer); setPasteOffer(null); } }}
            >
              You pasted multiple lines. Switch to batch mode?
            </Notice>
          )}

          {/* Slug */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Slug</span>
              <span className={`font-[family-name:var(--font-meta)] text-[11.5px] ${result.trimmed ? "text-[var(--color-warn)]" : "text-[var(--color-ink-3)]"}`}>
                {counter}{result.trimmed ? " · trimmed" : ""}
              </span>
            </div>
            <div className="flex items-stretch gap-2">
              <div className={`flex-1 flex items-center min-h-[54px] px-4 rounded-[var(--radius-10)] bg-[var(--color-canvas)] border ${result.slug ? "border-[#232828]" : "border-dashed border-[#232828]"} overflow-hidden`}>
                <span className={`font-[family-name:var(--font-meta)] text-[16px] truncate ${result.slug ? "text-[var(--color-ink)]" : "text-[var(--color-ink-6)]"}`}>
                  {result.slug || "your-slug-appears-here"}
                </span>
              </div>
              <CopyButton text={result.slug} disabled={!result.slug} label="Copy" />
            </div>
            {result.removed.length > 0 && (
              <p className="mt-2 font-[family-name:var(--font-meta)] text-[11.5px] text-[var(--color-ink-4)]">
                Removed: {result.removed.join(", ")}
              </p>
            )}
          </div>

          {result.trimmed && (
            <Notice level="warning">
              Trimmed to {result.slug.length} characters at a word boundary.
              {trimDropped.length > 0 && ` Dropped: ${trimDropped.join(", ")}. Raise Max length to keep them.`}
            </Notice>
          )}
          {noLatin && (
            <Notice level="info">
              This title has no Latin letters to make a slug from. Try a transliterated version.
            </Notice>
          )}

          {/* Options */}
          <div className="pt-4 border-t border-[var(--color-hairline-soft)] flex flex-wrap items-center gap-x-7 gap-y-3">
            <Toggle checked={opts.removeFiller} onChange={(v) => update({ removeFiller: v })} label="Remove filler words" />
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--color-ink-2)]">Max length</span>
              <Stepper value={opts.maxLength} onChange={(v) => update({ maxLength: v })} min={0} max={200} ariaLabel="Max length" />
              <span className="text-[12px] text-[var(--color-ink-4)]">characters, 0 for no limit</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Batch */}
          <div className="flex items-center justify-between">
            <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Titles · one per line</span>
            <Toggle size="inline" checked={opts.batch} onChange={(v) => update({ batch: v })} label="Batch mode" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea
              ref={inRef}
              autoFocus
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              onScroll={() => syncScroll("in")}
              placeholder="One title per line…"
              className="min-h-[220px] max-h-[60vh] px-3.5 py-2.5 text-[14px] leading-[1.62] resize-y bg-[var(--color-raised)] border border-[var(--color-border-control)] rounded-[var(--radius-10)] text-[var(--color-ink)] focus:border-[var(--color-accent-deep)] focus:outline-none"
            />
            <div
              ref={outRef}
              onScroll={() => syncScroll("out")}
              className="min-h-[220px] max-h-[60vh] overflow-y-auto px-3.5 py-2.5 rounded-[var(--radius-10)] bg-[var(--color-canvas)] border border-[#232828] font-[family-name:var(--font-meta)] text-[13px] leading-[1.62]"
            >
              {batchResult.outputs.map((line, i) => {
                const m = line.match(/^(.*?)(-\d+)$/);
                return (
                  <div key={i} className="whitespace-pre text-[var(--color-ink-1)] min-h-[1.62em]">
                    {line === "" ? " " : m ? (<>{m[1]}<span className="text-[var(--color-warn)]">{m[2]}</span></>) : line}
                  </div>
                );
              })}
            </div>
          </div>

          {batchResult.truncated && (
            <Notice level="warning">
              Batch mode handles up to 1,000 titles. The first 1,000 were converted.
            </Notice>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="font-[family-name:var(--font-meta)] text-[11.5px] text-[var(--color-ink-3)]">
              {batchResult.titleCount} titles · {batchResult.slugCount} slugs
              {batchResult.duplicateCount > 0 && (
                <span className="text-[var(--color-warn)]"> · {batchResult.duplicateCount} duplicate renamed</span>
              )}
            </span>
            <CopyButton text={batchCopyText} disabled={!batchCopyText.trim()} label="Copy all" />
          </div>

          <div className="pt-4 border-t border-[var(--color-hairline-soft)] flex flex-wrap items-center gap-x-7 gap-y-3">
            <Toggle checked={opts.removeFiller} onChange={(v) => update({ removeFiller: v })} label="Remove filler words" />
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--color-ink-2)]">Max length</span>
              <Stepper value={opts.maxLength} onChange={(v) => update({ maxLength: v })} min={0} max={200} ariaLabel="Max length" />
              <span className="text-[12px] text-[var(--color-ink-4)]">characters, 0 for no limit</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
