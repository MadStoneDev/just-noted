"use client";

import React from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";

// Option controls (spec §5.4). Labelled with plain words — no icon-only options.

export function Toggle({
  checked,
  onChange,
  label,
  size = "settings",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: "settings" | "inline";
}) {
  const dims = size === "inline" ? { w: 30, h: 17, knob: 13 } : { w: 34, h: 19, knob: 15 };
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative rounded-full transition-colors"
        style={{
          width: dims.w,
          height: dims.h,
          backgroundColor: checked ? "var(--color-accent-fill)" : "var(--color-border-control-strong)",
        }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
          style={{
            width: dims.knob,
            height: dims.knob,
            left: checked ? dims.w - dims.knob - 2 : 2,
            backgroundColor: checked ? "var(--color-accent-on-fill)" : "var(--color-ink-4)",
          }}
        />
      </button>
      <span className="text-[13.5px] text-[var(--color-ink-2)]">{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex p-0.5 rounded-[var(--radius-8)] border border-[var(--color-border-control-strong)]"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`px-3 h-7 rounded-[var(--radius-6)] text-[12.5px] font-medium transition-colors ${
              selected
                ? "bg-[var(--color-raised)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="inline-flex items-center h-[34px] rounded-[var(--radius-8)] border border-[var(--color-border-control)] bg-[var(--color-raised)] overflow-hidden">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
        className="w-[30px] h-full flex items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] border-r border-[var(--color-border-control)]"
      >
        <IconMinus size={14} />
      </button>
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/[^0-9]/g, ""));
          onChange(Number.isNaN(n) ? min : clamp(n));
        }}
        className="w-11 h-full text-center bg-transparent font-[family-name:var(--font-meta)] text-[13px] text-[var(--color-ink)] outline-none"
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
        className="w-[30px] h-full flex items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] border-l border-[var(--color-border-control)]"
      >
        <IconPlus size={14} />
      </button>
    </div>
  );
}
