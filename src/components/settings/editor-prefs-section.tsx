"use client";

import React, { useEffect, useState } from "react";
import { getUserSettings, updateEditorPrefs } from "@/app/actions/userSettingsActions";
import { writeEditorSpellcheck } from "@/utils/editor-font";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        on ? "bg-[var(--color-accent-fill)]" : "bg-[var(--color-raised-soft)] border border-[var(--color-hairline)]"
      }`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export default function EditorPrefsSection() {
  const [spellcheck, setSpellcheck] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserSettings()
      .then((s) => {
        setSpellcheck(s.editor.spellcheck);
        writeEditorSpellcheck(s.editor.spellcheck); // mirror server → localStorage (cross-device)
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggle = async (v: boolean) => {
    setSpellcheck(v);
    writeEditorSpellcheck(v);
    await updateEditorPrefs({ spellcheck: v });
  };

  if (loading) {
    return <div className="skeleton h-10 w-full rounded-[var(--radius-8)]" />;
  }

  return (
    <div>
      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-relaxed mb-4">
        Editor preferences. The editor font and size are under Appearance.
      </p>
      <div className="flex items-center justify-between gap-4 py-3 border-t border-[var(--color-hairline-soft)]">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-ink-1)]">Spellcheck</p>
          <p className="text-[12px] text-[var(--color-ink-5)] leading-snug">
            Check spelling as you write. Takes effect the next time you open a note.
          </p>
        </div>
        <Toggle on={spellcheck} onChange={toggle} />
      </div>
    </div>
  );
}
