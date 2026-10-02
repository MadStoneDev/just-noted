"use client";

import React, { useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  countWords,
  countGraphemes,
  countCharactersNoSpaces,
  countSentences,
  countParagraphs,
  readingSeconds,
  speakingSeconds,
  formatDuration,
} from "@/lib/text-tools/counts";
import { extractKeywords } from "@/lib/text-tools/keywords";
import CopyButton from "@/components/tools/ui/copy-button";
import CountsBar from "@/components/tools/ui/counts-bar";
import { Toggle, Segmented } from "@/components/tools/ui/controls";
import { useThrottledAnnounce } from "@/components/tools/ui/use-throttled-announce";
import { ToolsBottomBarContext } from "@/components/tools/tools-chrome";

const OPTS_KEY = "jn.tools.word-counter.options";
const MAX_WORDS = 200000;

interface Opts { phraseLen: 1 | 2 | 3; excludeCommon: boolean }
const DEFAULTS: Opts = { phraseLen: 1, excludeCommon: true };

const num = (n: number) => n.toLocaleString();

export default function WordCounter() {
  const [value, setValue] = useState("");
  const [opts, setOpts] = useState<Opts>(DEFAULTS);
  const [showAll, setShowAll] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const barNode = useContext(ToolsBottomBarContext);

  // Persist keyword options per tool (§12). User text is never persisted.
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

  // Autofocus on desktop only (§4.3).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 700px)").matches) taRef.current?.focus();
  }, []);

  // Cheap counts update live; keyword extraction (heavier) runs on a deferred
  // copy so fast typing in a long document stays responsive (§5.3).
  const words = countWords(value);
  const graphemes = countGraphemes(value);
  const noSpaces = countCharactersNoSpaces(value);
  const sentences = countSentences(value);
  const paragraphs = countParagraphs(value);

  const deferred = useDeferredValue(value);
  const keywords = useMemo(
    () => extractKeywords(deferred, { phraseLen: opts.phraseLen, excludeCommon: opts.excludeCommon, limit: 50 }),
    [deferred, opts.phraseLen, opts.excludeCommon],
  );

  const stats = [
    { number: num(words), label: "words", note: "" },
    { number: num(graphemes), label: "characters", note: `${num(noSpaces)} without spaces` },
    { number: num(sentences), label: "sentences", note: "" },
    { number: num(paragraphs), label: "paragraphs", note: "" },
    { number: formatDuration(readingSeconds(words)), label: "reading", note: "238 wpm" },
    { number: formatDuration(speakingSeconds(words)), label: "speaking", note: "130 wpm" },
  ];

  // Copy stats as plain text, one metric per line (§8.1).
  const statsText = [
    `Words: ${num(words)}`,
    `Characters: ${num(graphemes)} (${num(noSpaces)} without spaces)`,
    `Sentences: ${num(sentences)}`,
    `Paragraphs: ${num(paragraphs)}`,
    `Reading time: ${formatDuration(readingSeconds(words))} (238 wpm)`,
    `Speaking time: ${formatDuration(speakingSeconds(words))} (130 wpm)`,
  ].join("\n");

  const announced = useThrottledAnnounce(`${words} words, ${sentences} sentences, ${paragraphs} paragraphs`);

  const topCount = keywords[0]?.count ?? 0;
  const shown = showAll ? keywords : keywords.slice(0, 5);
  const overWords = words > MAX_WORDS;
  const empty = !value.trim();

  return (
    <>
      <div className="rounded-[var(--radius-14)] border border-[var(--color-hairline)] overflow-hidden grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left: input */}
        <div className="p-[18px] flex flex-col gap-3 min-[1100px]:border-r border-[var(--color-hairline)]">
          <label htmlFor="wc-input" className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">
            Text
          </label>
          <textarea
            id="wc-input"
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste or type your text"
            className="min-h-[420px] max-h-[70vh] resize-y rounded-[var(--radius-10)] bg-[var(--color-raised)] border border-[var(--color-border-control)] p-4 text-[16px] leading-[1.65] text-[var(--color-ink)] focus:border-[var(--color-accent-deep)] focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <span className={`flex-1 min-w-0 font-[family-name:var(--font-meta)] text-[11.5px] ${overWords ? "text-[var(--color-warn)]" : "text-[var(--color-ink-4)]"}`}>
              {overWords ? "Over 200,000 words — stats may lag." : "Stats update as you type · up to 200,000 words"}
            </span>
            <button
              type="button"
              onClick={() => { setValue(""); taRef.current?.focus(); }}
              disabled={empty}
              className="inline-flex items-center h-9 px-3 rounded-[var(--radius-7)] text-[13px] border border-[var(--color-border-control-strong)] text-[var(--color-ink)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
            >
              Clear
            </button>
            {/* Desktop/tablet: Copy stats here; mobile uses the sticky bar. */}
            <span className="hidden min-[700px]:inline-flex">
              <CopyButton text={statsText} disabled={empty} label="Copy stats" />
            </span>
          </div>
          {/* Throttled live region (§10). */}
          <span aria-live="polite" className="sr-only">{empty ? "" : announced}</span>
        </div>

        {/* Right: stats + keywords */}
        <div className="p-[18px] bg-[var(--color-panel)] flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-px bg-[var(--color-hairline)] rounded-[var(--radius-10)] overflow-hidden">
            {stats.map((s) => (
              <div key={s.label} className="bg-[var(--color-panel-alt)] p-[14px]">
                <div className="font-[family-name:var(--font-meta)] text-[26px] font-medium leading-none text-[var(--color-ink)]">{s.number}</div>
                <div className="mt-2 text-[12px] text-[var(--color-ink-3)]">{s.label}</div>
                {s.note && <div className="mt-0.5 text-[11.5px] text-[var(--color-ink-4)]">{s.note}</div>}
              </div>
            ))}
          </div>

          {/* Keywords */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Keywords</span>
              <Segmented
                ariaLabel="Phrase length"
                value={String(opts.phraseLen)}
                onChange={(v) => { update({ phraseLen: Number(v) as 1 | 2 | 3 }); setShowAll(false); }}
                options={[{ value: "1", label: "1 word" }, { value: "2", label: "2" }, { value: "3", label: "3" }]}
              />
            </div>
            <div className="mt-2.5">
              <Toggle
                size="inline"
                checked={opts.excludeCommon}
                onChange={(v) => { update({ excludeCommon: v }); setShowAll(false); }}
                label="Exclude common words"
              />
            </div>

            {shown.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-[var(--color-ink-4)]">
                Keywords appear once you&apos;ve written a few sentences.
              </p>
            ) : (
              <>
                <div className="mt-3">
                  {shown.map((row, i) => (
                    <div
                      key={row.term}
                      className="grid grid-cols-[1fr_34px_48px] items-center gap-2 py-[7px] border-b border-[var(--color-hairline-soft)] last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-[var(--color-ink)]">{row.term}</div>
                        <div
                          className="mt-1 h-[3px] rounded-full"
                          style={{
                            width: `${topCount > 0 ? Math.max(4, (row.count / topCount) * 100) : 0}%`,
                            backgroundColor: i < 2 ? "var(--color-accent-fill)" : "var(--color-accent-deep)",
                          }}
                        />
                      </div>
                      <div className="text-right font-[family-name:var(--font-meta)] text-[12px] text-[var(--color-ink-1)]">{num(row.count)}</div>
                      <div className="text-right font-[family-name:var(--font-meta)] text-[11.5px] text-[var(--color-ink-4)]">{row.pct.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                {!showAll && keywords.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="mt-2.5 text-[12px] text-[var(--color-accent-text)] hover:underline"
                  >
                    Show all {keywords.length}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky bar (§9.6): compact counts + Copy stats, portalled into
          the shell's in-flow slot below the scroll area. */}
      {barNode && createPortal(
        <div className="min-[700px]:hidden flex items-center gap-3 px-4 h-[68px] border-t border-[var(--color-hairline)] bg-[var(--color-panel)]">
          <div className="flex-1 min-w-0"><CountsBar compact text={value} /></div>
          <CopyButton text={statsText} disabled={empty} label="Copy stats" heightClass="h-12" />
        </div>,
        barNode,
      )}
    </>
  );
}
