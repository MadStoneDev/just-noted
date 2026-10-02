"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as C from "@/lib/text-tools/case";
import { useUndo } from "@/components/tools/ui/use-undo";
import CopyButton from "@/components/tools/ui/copy-button";
import CountsBar from "@/components/tools/ui/counts-bar";
import Notice from "@/components/tools/ui/notice";
import { Segmented } from "@/components/tools/ui/controls";
import { IconArrowBackUp } from "@tabler/icons-react";
import { usePlatformMod } from "@/lib/text-tools/platform";

type Transform = (s: string) => string;
interface Action {
  label: string;
  fn: Transform;
  mono?: boolean;
  /** Custom notice (dedupe/empty/sort report counts). */
  count?: (before: string, after: string) => string;
}

const lineN = (s: string) => s.split("\n").length;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const CASE_OPS: Action[] = [
  { label: "UPPERCASE", fn: C.toUpperCase },
  { label: "lowercase", fn: C.toLowerCase },
  { label: "Sentence case", fn: C.toSentenceCase },
  { label: "Title Case", fn: C.toTitleCase },
  { label: "Capitalise Every Word", fn: C.toCapitalizeWords },
];

const DEV_OPS: Action[] = [
  { label: "camelCase", fn: C.toCamelCase, mono: true },
  { label: "PascalCase", fn: C.toPascalCase, mono: true },
  { label: "snake_case", fn: C.toSnakeCase, mono: true },
  { label: "kebab-case", fn: C.toKebabCase, mono: true },
  { label: "CONSTANT_CASE", fn: C.toConstantCase, mono: true },
];

const CLEANUP_GROUPS: { sub: string; ops: Action[] }[] = [
  {
    sub: "Spaces",
    ops: [
      { label: "Trim spaces", fn: C.trimText },
      { label: "Remove extra spaces", fn: C.removeExtraSpaces },
      { label: "Remove line breaks", fn: C.removeLineBreaks },
      { label: "Remove empty lines", fn: C.removeEmptyLines, count: (b, a) => `Removed ${plural(lineN(b) - lineN(a), "empty line")}.` },
    ],
  },
  {
    sub: "Lines",
    ops: [
      { label: "Remove duplicate lines", fn: C.removeDuplicateLines, count: (b, a) => `Removed ${plural(lineN(b) - lineN(a), "duplicate line")}.` },
      { label: "Sort A–Z", fn: C.sortLinesAZ, count: (_b, a) => `Sorted ${plural(lineN(a), "line")} A–Z.` },
    ],
  },
  {
    sub: "Characters",
    ops: [
      { label: "“Straight quotes”", fn: C.toStraightQuotes },
      { label: "“Curly quotes”", fn: C.toCurlyQuotes },
      { label: "Strip <HTML>", fn: C.stripHtml, mono: true },
      { label: "Strip Markdown", fn: C.stripMarkdown, mono: true },
    ],
  },
];

function countChangedLines(before: string, after: string): number {
  const b = before.split("\n");
  const a = after.split("\n");
  let n = 0;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) if (a[i] !== b[i]) n++;
  return n;
}

export default function CaseConverter() {
  const { value, type, apply, undo, redo, canUndo } = useUndo("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const [selected, setSelected] = useState("");
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo: boolean } | null>(null);
  const { undo: undoKey } = usePlatformMod();

  // Roving tabindex for the palette toolbar (§10): one chip is tabbable; arrow
  // keys move focus across all chips.
  const allActions = useMemo(
    () => [...CASE_OPS, ...DEV_OPS, ...CLEANUP_GROUPS.flatMap((g) => g.ops)],
    [],
  );
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const onToolbarKeyDown = (e: React.KeyboardEvent) => {
    const n = allActions.length;
    let next = focusIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (focusIdx + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (focusIdx - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    setFocusIdx(next);
    chipRefs.current[next]?.focus();
  };

  // Mobile (§9.5): one group shown at a time; sticky bar rises with the keyboard.
  const [mobileGroup, setMobileGroup] = useState<"Case" | "Developer" | "Cleanup">("Case");
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); };
  }, []);

  // Wrap undo/redo so the "what changed" notice is cleared when the action it
  // described is reverted/reapplied (it would otherwise linger with a stale Undo).
  const doUndo = () => { undo(); setNotice(null); };
  const doRedo = () => { redo(); setNotice(null); };

  // Reselect the changed range after a transform re-renders the textarea.
  useEffect(() => {
    if (pendingSel.current && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(pendingSel.current[0], pendingSel.current[1]);
      pendingSel.current = null;
    }
  });

  const syncSelection = () => {
    const ta = taRef.current;
    if (!ta) return;
    setSelected(ta.value.slice(ta.selectionStart, ta.selectionEnd));
  };

  const runAction = (action: Action) => {
    const ta = taRef.current;
    if (!value || !ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const hasSel = start !== end;
    setLastUsed(action.label);

    let after: string;
    let range: [number, number];
    if (hasSel) {
      const seg = value.slice(start, end);
      const t = action.fn(seg);
      after = value.slice(0, start) + t + value.slice(end);
      range = [start, start + t.length];
    } else {
      after = action.fn(value);
      range = [0, after.length];
    }

    if (after === value) {
      setNotice({ text: "Nothing to change.", undo: false });
      return;
    }
    apply(after);
    pendingSel.current = range;
    const msg = action.count
      ? action.count(value, after)
      : `${action.label} applied to ${hasSel ? "selection" : "all text"}, ${plural(countChangedLines(value, after), "line")} changed.`;
    setNotice({ text: msg, undo: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    }
  };

  const disabled = !value;

  const Chip = ({ action }: { action: Action }) => {
    const idx = allActions.indexOf(action);
    return (
    <button
      type="button"
      ref={(el) => { chipRefs.current[idx] = el; }}
      tabIndex={focusIdx === idx ? 0 : -1}
      onFocus={() => setFocusIdx(idx)}
      onClick={() => runAction(action)}
      className={`h-8 px-2.5 rounded-[var(--radius-7)] text-[12.5px] border transition-colors ${
        action.mono ? "font-[family-name:var(--font-meta)]" : ""
      } ${
        lastUsed === action.label
          ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
          : "bg-[var(--color-raised-soft)] border-[var(--color-border-control)] text-[var(--color-ink-1)] hover:bg-[var(--color-raised)] hover:border-[var(--color-border-control-strong)]"
      }`}
    >
      {action.label}
    </button>
    );
  };

  const CleanupChip = ({ action }: { action: Action }) => {
    const idx = allActions.indexOf(action);
    return (
    <button
      type="button"
      ref={(el) => { chipRefs.current[idx] = el; }}
      tabIndex={focusIdx === idx ? 0 : -1}
      onFocus={() => setFocusIdx(idx)}
      onClick={() => runAction(action)}
      className={`h-[30px] px-2.5 rounded-[var(--radius-7)] text-[12px] border transition-colors ${
        action.mono ? "font-[family-name:var(--font-meta)]" : ""
      } ${
        lastUsed === action.label
          ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
          : "border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised)] hover:border-[var(--color-border-control-strong)]"
      }`}
    >
      {action.label}
    </button>
    );
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)] mb-2">
      {children}
    </div>
  );

  const MobileChip = ({ action }: { action: Action }) => (
    <button
      type="button"
      onClick={() => runAction(action)}
      className={`shrink-0 h-11 px-3.5 rounded-[var(--radius-9)] text-[14px] border whitespace-nowrap ${
        action.mono ? "font-[family-name:var(--font-meta)]" : ""
      } ${
        lastUsed === action.label
          ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
          : "bg-[var(--color-raised-soft)] border-[var(--color-border-control)] text-[var(--color-ink-1)]"
      }`}
    >
      {action.label}
    </button>
  );

  return (
    <>
    <div className="rounded-[var(--radius-14)] border border-[var(--color-hairline)] overflow-hidden grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_316px]">
      {/* Left: editor */}
      <div className="p-[18px] flex flex-col gap-3 min-[1100px]:border-r border-[var(--color-hairline)]">
        {notice && (
          <Notice level="info" action={notice.undo ? { label: "Undo", onClick: doUndo } : undefined}>
            {notice.text}
          </Notice>
        )}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => { type(e.target.value); setNotice(null); syncSelection(); }}
          onSelect={syncSelection}
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
          onKeyDown={onKeyDown}
          placeholder="Paste or type text to convert"
          className="min-h-[370px] max-h-[60vh] resize-y rounded-[var(--radius-10)] bg-[var(--color-raised)] border border-[var(--color-border-control)] p-4 text-[16px] leading-[1.6] text-[var(--color-ink)] focus:border-[var(--color-accent-deep)] focus:outline-none"
        />
        {/* Desktop/tablet action row — mobile uses the sticky bar below. */}
        <div className="hidden min-[700px]:flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-0 overflow-x-auto"><CountsBar text={value} selected={selected} /></div>
          <button
            type="button"
            onClick={doUndo}
            disabled={!canUndo}
            title={`Undo (${undoKey})`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-7)] text-[13px] border border-[var(--color-border-control-strong)] text-[var(--color-ink)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-40"
          >
            <IconArrowBackUp size={13} /> Undo
          </button>
          <CopyButton text={value} disabled={disabled} label="Copy" />
        </div>

        {/* Mobile palette (§9.5): group segmented control + one horizontally
            scrolling 44px chip row. Only shown below 700px. */}
        <div className={`min-[700px]:hidden flex flex-col gap-3 ${disabled ? "opacity-[0.42] pointer-events-none" : ""}`}>
          <Segmented
            ariaLabel="Transformation group"
            value={mobileGroup}
            onChange={(v) => setMobileGroup(v)}
            options={[{ value: "Case", label: "Case" }, { value: "Developer", label: "Developer" }, { value: "Cleanup", label: "Cleanup" }]}
          />
          <div className="flex gap-2 overflow-x-auto -mr-4 pr-4 pb-1 scrollbar-thin">
            {mobileGroup === "Case" && CASE_OPS.map((a) => <MobileChip key={a.label} action={a} />)}
            {mobileGroup === "Developer" && DEV_OPS.map((a) => <MobileChip key={a.label} action={a} />)}
            {mobileGroup === "Cleanup" && CLEANUP_GROUPS.map((g) => (
              <React.Fragment key={g.sub}>
                <span className="shrink-0 self-center text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)] px-1">{g.sub}</span>
                {g.ops.map((a) => <MobileChip key={a.label} action={a} />)}
              </React.Fragment>
            ))}
          </div>
        </div>
        {/* Spacer so the fixed mobile bar doesn't cover the end of the content. */}
        <div className="min-[700px]:hidden h-16" aria-hidden />
      </div>

      {/* Right: palette (desktop/tablet) */}
      <div onKeyDown={onToolbarKeyDown} className={`hidden min-[700px]:flex p-[18px] bg-[var(--color-panel)] flex-col gap-[18px] transition-opacity ${disabled ? "opacity-[0.42] pointer-events-none" : ""}`} aria-disabled={disabled} role="toolbar" aria-label="Transformations">
        <div>
          <Label>Case</Label>
          <div className="flex flex-wrap gap-2">{CASE_OPS.map((a) => <Chip key={a.label} action={a} />)}</div>
        </div>
        <div>
          <Label>Developer</Label>
          <div className="flex flex-wrap gap-2">{DEV_OPS.map((a) => <Chip key={a.label} action={a} />)}</div>
        </div>
        <div>
          <Label>Cleanup</Label>
          <div className="flex flex-col gap-3">
            {CLEANUP_GROUPS.map((g) => (
              <div key={g.sub}>
                <div className="text-[11px] text-[var(--color-ink-4)] mb-1.5">{g.sub}</div>
                <div className="flex flex-wrap gap-2">{g.ops.map((a) => <CleanupChip key={a.label} action={a} />)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Mobile sticky bottom bar (§9.5): counts · Undo · Copy, rising with the
        on-screen keyboard. Only below 700px. */}
    <div
      className="min-[700px]:hidden fixed left-0 right-0 z-40 flex items-center gap-3 px-4 border-t border-[var(--color-hairline)] bg-[var(--color-panel)]"
      style={{ bottom: kbInset, height: "calc(68px + env(safe-area-inset-bottom))", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex-1 min-w-0 overflow-x-auto"><CountsBar text={value} selected={selected} /></div>
      <button
        type="button"
        onClick={doUndo}
        disabled={!canUndo}
        aria-label="Undo"
        className="shrink-0 w-12 h-12 flex items-center justify-center rounded-[var(--radius-9)] border border-[var(--color-border-control-strong)] text-[var(--color-ink)] disabled:opacity-40"
      >
        <IconArrowBackUp size={18} />
      </button>
      <CopyButton text={value} disabled={disabled} label="Copy" heightClass="h-12" />
    </div>
    </>
  );
}
