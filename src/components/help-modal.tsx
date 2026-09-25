"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconX,
  IconChevronRight,
  IconChevronLeft,
  IconKeyboard,
  IconHelpCircle,
  IconInfoCircle,
  IconMap2,
  IconArticle,
} from "@tabler/icons-react";
import { KEYBOARD_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts";
import { ROADMAP, type RoadmapStatus } from "@/data/roadmap";

type View = "menu" | "shortcuts" | "roadmap";

const STATUS_DOT: Record<RoadmapStatus, string> = {
  shipped: "#3DA35D",
  "in-progress": "var(--color-accent-fill)",
  planned: "var(--color-ink-6)",
};

// Help menu (design surface 08). Opened from the rail's Help button. Mirrors the
// search/command modal: a list of destinations, with Keyboard Shortcuts shown
// inline. How it Works / About / Roadmap / Blog are wired as they're built.
export default function HelpModal() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");

  useEffect(() => {
    const onOpen = () => { setView("menu"); setOpen(true); };
    window.addEventListener("justnoted:open-help", onOpen);
    return () => window.removeEventListener("justnoted:open-help", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view !== "menu") setView("menu");
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, view]);

  if (!open) return null;

  const items: {
    id: string;
    label: string;
    icon: React.ReactNode;
    arrow?: boolean;
    soon?: boolean;
    onClick?: () => void;
  }[] = [
    { id: "blog", label: "Articles", icon: <IconArticle size={17} />, arrow: true, soon: true },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: <IconKeyboard size={17} />, arrow: true, onClick: () => setView("shortcuts") },
    { id: "how", label: "How it works", icon: <IconHelpCircle size={17} />, soon: true },
    { id: "about", label: "About", icon: <IconInfoCircle size={17} />, soon: true },
    { id: "roadmap", label: "Roadmap", icon: <IconMap2 size={17} />, arrow: true, onClick: () => setView("roadmap") },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9500] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[440px] max-h-[70vh] flex flex-col bg-[var(--color-panel-alt)] border border-[var(--color-hairline)] rounded-[16px] shadow-[0_24px_60px_rgba(0,0,0,.45)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 h-12 flex-none border-b border-[var(--color-hairline-soft)]">
          {view !== "menu" ? (
            <button onClick={() => setView("menu")} className="w-7 h-7 -ml-1 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)]">
              <IconChevronLeft size={17} />
            </button>
          ) : (
            <IconHelpCircle size={17} className="text-[var(--color-ink-4)]" />
          )}
          <span className="flex-1 text-[14px] font-semibold text-[var(--color-ink-1)]">
            {view === "shortcuts" ? "Keyboard shortcuts" : view === "roadmap" ? "Roadmap" : "Help"}
          </span>
          <button onClick={() => setOpen(false)} aria-label="Close" className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-ink-1)] hover:bg-[var(--color-raised-soft)]">
            <IconX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
          {view === "menu" ? (
            items.map((it) => (
              <button
                key={it.id}
                onClick={it.soon ? undefined : it.onClick}
                disabled={it.soon}
                className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-8)] text-left transition-colors ${
                  it.soon ? "opacity-50 cursor-default" : "hover:bg-[var(--color-raised-soft)]"
                }`}
              >
                <span className="text-[var(--color-ink-4)]">{it.icon}</span>
                <span className="flex-1 text-[13.5px] text-[var(--color-ink-1)]">{it.label}</span>
                {it.soon ? (
                  <span className="text-[10px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] bg-[var(--color-raised-soft)] text-[var(--color-ink-5)]">soon</span>
                ) : it.arrow ? (
                  <IconChevronRight size={15} className="text-[var(--color-ink-5)]" />
                ) : null}
              </button>
            ))
          ) : view === "shortcuts" ? (
            <ul className="flex flex-col gap-0.5 py-1">
              {KEYBOARD_SHORTCUTS.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-[var(--radius-8)] hover:bg-[var(--color-raised-soft)]">
                  <span className="text-[13px] text-[var(--color-ink-2)]">{s.description}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k, j) => (
                      <kbd key={j} className="min-w-[20px] text-center text-[11px] font-[family-name:var(--font-meta)] px-1.5 py-0.5 rounded-[var(--radius-5)] border border-[var(--color-border-control)] bg-[var(--color-raised)] text-[var(--color-ink-3)]">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-4 py-1.5 px-1">
              {ROADMAP.map((group) => (
                <div key={group.status}>
                  <div className="flex items-center gap-1.5 mb-1.5 px-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[group.status] }} />
                    <span className="text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
                      {group.label}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((it, i) => (
                      <li key={i} className="px-2.5 py-2 rounded-[var(--radius-8)] hover:bg-[var(--color-raised-soft)]">
                        <div className="text-[13px] text-[var(--color-ink-1)]">{it.title}</div>
                        <div className="mt-0.5 text-[12px] leading-[1.5] text-[var(--color-ink-4)]">{it.blurb}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="px-2.5 pt-1 pb-1 text-[11px] leading-[1.5] text-[var(--color-ink-5)]">
                Plans evolve and timings aren't promises — but this is where we're headed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
