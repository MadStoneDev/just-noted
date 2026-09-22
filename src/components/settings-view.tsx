"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ds/theme-toggle";
import {
  readEditorFont,
  writeEditorFont,
  type EditorFont,
  readEditorFontSize,
  writeEditorFontSize,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
} from "@/utils/editor-font";
import {
  IconX,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
} from "@tabler/icons-react";

interface SettingsViewProps {
  onClose: () => void;
}

const SECTIONS = [
  "Appearance",
  "Account",
  "Editor",
  "Sync & data",
  "Notifications",
  "Security",
] as const;
type Section = (typeof SECTIONS)[number];

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: IconSun, bg: "#FBFCFB", ink: "#131817" },
  { value: "dark" as const, label: "Dark", icon: IconMoon, bg: "#0A0C0C", ink: "#EEF1F0" },
  { value: "system" as const, label: "System", icon: IconDeviceDesktop, bg: "#FBFCFB", ink: "#131817" },
];

const FONT_OPTIONS: { value: EditorFont; label: string; family: string }[] = [
  { value: "serif", label: "Serif", family: "var(--font-newsreader), Georgia, serif" },
  { value: "sans", label: "Sans", family: "var(--font-public-sans), system-ui, sans-serif" },
  { value: "mono", label: "Mono", family: '"JetBrains Mono", ui-monospace, monospace' },
];

// Design handoff surface 06 — Settings inside the shell.
export default function SettingsView({ onClose }: SettingsViewProps) {
  const { theme, setTheme } = useTheme();
  const [font, setFont] = useState<EditorFont>("serif");
  const [fontSize, setFontSize] = useState(18);
  const [section, setSection] = useState<Section>("Appearance");

  useEffect(() => {
    setFont(readEditorFont());
    setFontSize(readEditorFontSize());
  }, []);

  const chooseFont = (f: EditorFont) => {
    setFont(f);
    writeEditorFont(f);
  };

  const chooseFontSize = (px: number) => {
    setFontSize(px);
    writeEditorFontSize(px);
  };

  return (
    <div className="flex-1 flex min-h-0 bg-[var(--color-canvas)]">
      {/* Section list — stands in for the notes sidebar while Settings is open */}
      <nav className="w-[260px] flex-none border-r border-[var(--color-hairline)] bg-[var(--color-panel)] py-6 px-3 overflow-y-auto scrollbar-thin">
        <div className="px-2 mb-3 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.14em] text-[var(--color-ink-5)]">
          Settings
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-8)] text-[13.5px] transition-colors ${
              section === s
                ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] border border-[var(--color-accent-tint-border)]"
                : "text-[var(--color-ink-2)] border border-transparent hover:bg-[var(--color-raised-soft)]"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="mt-2 pt-2 border-t border-[var(--color-hairline-soft)]">
          <Link
            href="/profile"
            className="block w-full text-left px-2.5 py-2 rounded-[var(--radius-8)] text-[13.5px] text-[var(--color-danger-strong)] hover:bg-[var(--color-raised-soft)] transition-colors"
          >
            Danger zone
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[680px] px-10 py-8">
          <div className="flex items-start justify-between mb-6">
            <h1 className="font-[family-name:var(--font-editor)] text-[32px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              {section}
            </h1>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>

          {section === "Appearance" ? (
            <div className="space-y-8">
              <p className="text-[13px] text-[var(--color-ink-4)] -mt-3">
                Applies to every surface, including shared notes you open.
              </p>

              {/* Theme */}
              <div>
                <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-3">Theme</h2>
                <div className="grid grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className="rounded-[var(--radius-10)] overflow-hidden text-left transition-shadow"
                        style={{
                          border: active
                            ? "2px solid var(--color-accent-fill)"
                            : "2px solid var(--color-hairline)",
                        }}
                      >
                        <div
                          className="h-[84px] flex items-end p-2"
                          style={{ background: opt.bg }}
                        >
                          <span
                            className="h-2 w-1/2 rounded-full"
                            style={{ background: opt.ink, opacity: 0.85 }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[var(--color-panel)]">
                          <Icon size={13} className="text-[var(--color-ink-4)]" />
                          <span className="text-[12.5px] text-[var(--color-ink-2)]">{opt.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editor font */}
              <div>
                <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)] mb-3">Editor font</h2>
                <div className="grid grid-cols-3 gap-3">
                  {FONT_OPTIONS.map((opt) => {
                    const active = font === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => chooseFont(opt.value)}
                        className="rounded-[var(--radius-10)] px-3 py-4 text-center transition-colors"
                        style={{
                          border: active
                            ? "2px solid var(--color-accent-fill)"
                            : "2px solid var(--color-hairline)",
                          background: active ? "var(--color-accent-tint)" : "transparent",
                        }}
                      >
                        <div
                          className="text-[22px] text-[var(--color-ink-1)] leading-none"
                          style={{ fontFamily: opt.family }}
                        >
                          Ag
                        </div>
                        <div className="mt-2 text-[12px] text-[var(--color-ink-3)]">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-ink-5)]">
                  Changes the editor body and title only — the rest of the app stays as is.
                </p>
              </div>

              {/* Font size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[13.5px] font-semibold text-[var(--color-ink-1)]">Font size</h2>
                  <span className="text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  value={fontSize}
                  onChange={(e) => chooseFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--color-accent-fill)]"
                />
                <div className="flex justify-between text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
                  <span>{FONT_SIZE_MIN}</span>
                  <span>{FONT_SIZE_MAX}</span>
                </div>
              </div>
            </div>
          ) : section === "Account" || section === "Security" ? (
            <div className="text-[13.5px] text-[var(--color-ink-4)] leading-[1.6]">
              Account and security settings live on your{" "}
              <Link href="/profile" className="text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)] underline decoration-dotted underline-offset-2">
                profile page
              </Link>
              . Notes are encrypted in transit and at rest — this is not end-to-end encryption.
            </div>
          ) : (
            <div className="text-[13.5px] text-[var(--color-ink-4)] leading-[1.6]">
              {section} settings are coming here as the redesign lands. For now,
              your existing controls remain where they were.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
