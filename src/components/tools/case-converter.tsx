"use client";

import React, { useState, useMemo } from "react";
import { IconCopy, IconCheck, IconArrowBackUp } from "@tabler/icons-react";
import * as C from "@/lib/text-tools/case";

type Transform = (s: string) => string;

const CASE_OPS: { label: string; fn: Transform }[] = [
  { label: "UPPERCASE", fn: C.toUpperCase },
  { label: "lowercase", fn: C.toLowerCase },
  { label: "Sentence case", fn: C.toSentenceCase },
  { label: "Title Case", fn: C.toTitleCase },
  { label: "Capitalise Each", fn: C.toCapitalizeWords },
  { label: "camelCase", fn: C.toCamelCase },
  { label: "PascalCase", fn: C.toPascalCase },
  { label: "snake_case", fn: C.toSnakeCase },
  { label: "kebab-case", fn: C.toKebabCase },
  { label: "CONSTANT_CASE", fn: C.toConstantCase },
];

const CLEANUP_OPS: { label: string; fn: Transform }[] = [
  { label: "Trim", fn: C.trimText },
  { label: "Collapse spaces", fn: C.removeExtraSpaces },
  { label: "Remove line breaks", fn: C.removeLineBreaks },
  { label: "Remove empty lines", fn: C.removeEmptyLines },
  { label: "Remove duplicate lines", fn: C.removeDuplicateLines },
  { label: "Sort A–Z", fn: C.sortLinesAZ },
  { label: "Straight quotes", fn: C.toStraightQuotes },
  { label: "Curly quotes", fn: C.toCurlyQuotes },
  { label: "Strip HTML", fn: C.stripHtml },
  { label: "Strip Markdown", fn: C.stripMarkdown },
];

export default function CaseConverter() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const apply = (fn: Transform) => {
    setText((cur) => {
      const next = fn(cur);
      if (next !== cur) setHistory((h) => [...h, cur]);
      return next;
    });
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setText(prev);
      return h.slice(0, -1);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };

  const counts = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const lines = text ? text.split(/\n/).length : 0;
    return { words, chars, lines };
  }, [text]);

  const Pill = ({ label, fn }: { label: string; fn: Transform }) => (
    <button
      onClick={() => apply(fn)}
      disabled={!text}
      className="h-8 px-2.5 rounded-[var(--radius-7)] text-[12.5px] font-medium text-[var(--color-ink-2)] border border-[var(--color-border-control)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors disabled:opacity-40"
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => {
          // Direct typing is its own undo step so a transform after typing reverts to typed text.
          setHistory((h) => (text ? [...h, text] : h));
          setText(e.target.value);
        }}
        placeholder="Paste or type text…"
        rows={8}
        className="w-full px-3.5 py-2.5 text-[14px] leading-relaxed resize-y bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
      />

      {/* Counts + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
          {counts.words.toLocaleString()} words · {counts.chars.toLocaleString()} chars · {counts.lines.toLocaleString()} line{counts.lines !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-7)] text-[12.5px] font-medium text-[var(--color-ink-2)] border border-[var(--color-border-control)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
          >
            <IconArrowBackUp size={14} /> Undo
          </button>
          <button
            onClick={copy}
            disabled={!text}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-7)] text-[12.5px] font-medium text-[var(--color-ink-2)] border border-[var(--color-border-control)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Case */}
      <div>
        <div className="mb-1.5 text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">Case</div>
        <div className="flex flex-wrap gap-2">
          {CASE_OPS.map((op) => <Pill key={op.label} {...op} />)}
        </div>
      </div>

      {/* Cleanup */}
      <div>
        <div className="mb-1.5 text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">Cleanup</div>
        <div className="flex flex-wrap gap-2">
          {CLEANUP_OPS.map((op) => <Pill key={op.label} {...op} />)}
        </div>
      </div>
    </div>
  );
}
