"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fitSingleLine, wrapToLines, overflowChars, overflowCharsWrapped, cutTail, type Measure } from "@/lib/text-tools/serp";
import { Segmented } from "@/components/tools/ui/controls";
import { useThrottledAnnounce } from "@/components/tools/ui/use-throttled-announce";

const OPTS_KEY = "jn.tools.serp-preview.device";

// Fixed desktop-SERP limits used for the counters, meters and status (the
// Desktop/Mobile switch only changes the preview card). Measurement is by pixel
// width (§8.2): title in 20px Arial, description in 14px Arial, both at 600px.
const TITLE_CHAR = 60, TITLE_PX = 600;
const DESC_CHAR = 160, DESC_PX = 600, DESC_LINES = 2;

const len = (s: string) => Array.from(s).length;

// A canvas measurer for a given Arial size. During SSR (empty fields only)
// falls back to a rough estimate; the client recomputes with real metrics.
function useMeasure(font: string): Measure {
  return useMemo<Measure>(() => {
    if (typeof document === "undefined") return (s) => s.length * parseInt(font) * 0.5;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return (s) => s.length * parseInt(font) * 0.5;
    return (s) => { ctx.font = font; return ctx.measureText(s).width; };
  }, [font]);
}

function Meter({ length, limit }: { length: number; limit: number }) {
  const scale = limit * 1.3; // tick sits at ~77% of the track
  const tickPct = (limit / scale) * 100;
  const fillPct = (Math.min(length, scale) / scale) * 100;
  const accentPct = Math.min(fillPct, tickPct);
  const warnPct = Math.max(0, fillPct - tickPct);
  return (
    <div className="relative mt-1 h-[10px]" aria-hidden>
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-[2px] bg-[var(--color-hairline)] overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-[var(--color-accent-fill)]" style={{ width: `${accentPct}%` }} />
        {warnPct > 0 && (
          <div className="absolute inset-y-0 bg-[var(--color-warn)]" style={{ left: `${tickPct}%`, width: `${warnPct}%` }} />
        )}
      </div>
      <div className="absolute top-0 w-px h-[10px] bg-[var(--color-ink-3)]" style={{ left: `${tickPct}%` }} />
    </div>
  );
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export default function SerpPreview() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPTS_KEY);
      if (raw === "desktop" || raw === "mobile") setDevice(raw);
    } catch {}
  }, []);
  const pickDevice = (d: "desktop" | "mobile") => {
    setDevice(d);
    try { localStorage.setItem(OPTS_KEY, d); } catch {}
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 700px)").matches) titleRef.current?.focus();
  }, []);

  const m20 = useMeasure("20px Arial");
  const m18 = useMeasure("18px Arial");
  const m14 = useMeasure("14px Arial");

  // Status (desktop limits).
  const titleOver = title.trim() !== "" && m20(title) > TITLE_PX;
  const titleShortenBy = titleOver ? overflowChars(title, TITLE_PX, m20) : 0;
  const titleTail = titleOver ? cutTail(fitSingleLine(title, TITLE_PX, m20).visible) : "";

  const descWrap = wrapToLines(description, DESC_PX, DESC_LINES, m14);
  const descOver = description.trim() !== "" && descWrap.truncated;
  const descShortenBy = descOver ? overflowCharsWrapped(description, DESC_PX, DESC_LINES, m14) : 0;
  const descTail = descOver ? cutTail(descWrap.lines[descWrap.lines.length - 1] ?? "") : "";

  // Preview card content (device-dependent).
  const cardWidth = device === "mobile" ? 360 : 600;
  const inner = cardWidth - 2 * (device === "mobile" ? 16 : 26);
  const titleFit = useMemo(() => {
    if (device === "mobile") return wrapToLines(title, inner, 2, m18);
    const one = fitSingleLine(title, inner, m20);
    return { lines: one.visible ? [one.visible] : [], truncated: one.truncated };
  }, [device, title, inner, m18, m20]);
  const descFit = wrapToLines(description, inner, device === "mobile" ? 3 : 2, m14);

  const parsed = useMemo(() => parseUrl(url), [url]);
  const announced = useThrottledAnnounce(
    title.trim() === "" && description.trim() === ""
      ? ""
      : `Title ${titleOver ? "over" : "within"} length. Description ${descOver ? "over" : "within"} length.`,
  );

  const titleCounterColor = title.trim() === "" ? "text-[var(--color-ink-5)]" : titleOver ? "text-[var(--color-warn)]" : "text-[var(--color-ink-3)]";
  const descCounterColor = description.trim() === "" ? "text-[var(--color-ink-5)]" : descOver ? "text-[var(--color-warn)]" : "text-[var(--color-ink-3)]";
  const overBorder = "border-[var(--color-warn-tint-border)]";

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[420px_minmax(0,1fr)] rounded-[var(--radius-14)] border border-[var(--color-hairline)] overflow-hidden">
      {/* Left: inputs */}
      <div className="p-5 flex flex-col gap-5 min-[1100px]:border-r border-[var(--color-hairline)]">
        {/* Title */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="serp-title" className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Page title</label>
            <span className={`font-[family-name:var(--font-meta)] text-[11.5px] ${titleCounterColor}`}>{len(title)} / {TITLE_CHAR}</span>
          </div>
          <textarea
            id="serp-title"
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => { setTitle(e.target.value); autoGrow(e.target); }}
            placeholder="Your page title"
            className={`w-full resize-none overflow-hidden px-3 py-2 text-[14.5px] leading-[1.45] rounded-[var(--radius-9)] bg-[var(--color-raised)] border ${titleOver ? overBorder : "border-[var(--color-border-control)]"} text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-accent-deep)]`}
          />
          <Meter length={len(title)} limit={TITLE_CHAR} />
          {title.trim() !== "" && (
            <p className="mt-1.5 text-[12px] leading-[1.4]" style={titleOver ? { color: "var(--color-warn)" } : undefined}>
              {titleOver
                ? <>Likely to be cut off after &ldquo;{titleTail}&rdquo;. Shorten by about {titleShortenBy} character{titleShortenBy === 1 ? "" : "s"}.</>
                : <span className="text-[var(--color-ink-4)]">Good length.</span>}
            </p>
          )}
        </div>

        {/* URL */}
        <div>
          <label htmlFor="serp-url" className="block mb-1.5 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">URL</label>
          <input
            id="serp-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="w-full h-[42px] px-3 font-[family-name:var(--font-meta)] text-[13px] rounded-[var(--radius-9)] bg-[var(--color-raised)] border border-[var(--color-border-control)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-accent-deep)]"
          />
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="serp-desc" className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Meta description</label>
            <span className={`font-[family-name:var(--font-meta)] text-[11.5px] ${descCounterColor}`}>{len(description)} / {DESC_CHAR}</span>
          </div>
          <textarea
            id="serp-desc"
            ref={descRef}
            value={description}
            onChange={(e) => { setDescription(e.target.value); autoGrow(e.target); }}
            placeholder="Your meta description…"
            className={`w-full resize-none overflow-hidden min-h-[92px] px-3 py-2 text-[14px] leading-[1.5] rounded-[var(--radius-9)] bg-[var(--color-raised)] border ${descOver ? overBorder : "border-[var(--color-border-control)]"} text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-accent-deep)]`}
          />
          <Meter length={len(description)} limit={DESC_CHAR} />
          {description.trim() !== "" && (
            <p className="mt-1.5 text-[12px] leading-[1.4]" style={descOver ? { color: "var(--color-warn)" } : undefined}>
              {descOver
                ? <>Likely to be cut off after &ldquo;{descTail}&rdquo;. Shorten by about {descShortenBy} character{descShortenBy === 1 ? "" : "s"}.</>
                : len(description) < 70
                  ? <span className="text-[var(--color-ink-4)]">Short, consider adding detail.</span>
                  : <span className="text-[var(--color-ink-4)]">Good length.</span>}
            </p>
          )}
        </div>
        <span aria-live="polite" className="sr-only">{announced}</span>
      </div>

      {/* Right: preview */}
      <div className="p-5 bg-[var(--color-panel)] flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-5)]">Preview</span>
          <Segmented
            ariaLabel="Preview device"
            value={device}
            onChange={(v) => pickDevice(v)}
            options={[{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]}
          />
        </div>

        {/* Always-white neutral result card (no engine branding). */}
        <div
          className="rounded-[12px]"
          style={{ backgroundColor: "#FFFFFF", padding: device === "mobile" ? "20px 16px" : "24px 26px", width: device === "mobile" ? 360 : "100%", maxWidth: "100%", fontFamily: "Arial, sans-serif" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center shrink-0 rounded-full text-[12px]"
              style={{ width: 28, height: 28, backgroundColor: "#F1F3F4", border: "1px solid #DADCE0", color: "#4D5156" }}
            >
              {parsed.initials}
            </div>
            <div className="min-w-0">
              <div style={{ fontSize: 14, color: "#202124", lineHeight: 1.2 }}>{parsed.siteName}</div>
              <div style={{ fontSize: 12, color: "#4D5156", lineHeight: 1.3 }} className="truncate">{parsed.breadcrumb}</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: device === "mobile" ? 18 : 20,
              lineHeight: 1.3,
              color: "#1A0DAB",
            }}
          >
            {titleFit.lines.length > 0
              ? titleFit.lines.map((l, i) => (
                  <span key={i}>{l}{i === titleFit.lines.length - 1 && titleFit.truncated ? "…" : ""}{i < titleFit.lines.length - 1 ? " " : ""}</span>
                ))
              : <span style={{ color: "#9AA0A6" }}>Your page title</span>}
          </div>

          <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.58, color: "#4D5156" }}>
            {descFit.lines.length > 0
              ? descFit.lines.map((l, i) => (
                  <React.Fragment key={i}>{l}{i === descFit.lines.length - 1 && descFit.truncated ? "…" : ""}{i < descFit.lines.length - 1 ? " " : ""}</React.Fragment>
                ))
              : <span style={{ color: "#9AA0A6" }}>Your meta description…</span>}
          </div>
        </div>

        <p className="text-[12px] leading-[1.55] text-[var(--color-ink-4)]">
          This is an approximation. Search engines can rewrite titles and descriptions, and they truncate by pixel width rather than character count.
        </p>
      </div>
    </div>
  );
}

// Strip the protocol and render as `https://domain › segment › segment`.
function parseUrl(raw: string): { siteName: string; breadcrumb: string; initials: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { siteName: "example.com", breadcrumb: "https://example.com", initials: "E" };
  }
  const noProto = trimmed.replace(/^[a-z]+:\/\//i, "");
  const [domainRaw, ...rest] = noProto.split("/");
  const domain = domainRaw || "example.com";
  const segments = rest.filter((s) => s.trim() !== "").map((s) => decodeURIComponent(s));
  const breadcrumb = ["https://" + domain, ...segments].join(" › ");
  const bare = domain.replace(/^www\./, "");
  const initials = bare.slice(0, 1).toUpperCase();
  return { siteName: bare, breadcrumb, initials };
}
