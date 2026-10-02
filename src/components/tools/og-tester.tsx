"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";

// OpenGraph tester (spec §8.3). All fetching/parsing happens server-side at
// /api/tools/og behind SSRF protection; this component is the UI: input row,
// three-step loading, the six error notices, summary + platform tabs, five
// neutral (unbranded, always-light) previews, the ordered checklist and the
// raw-tags disclosure.

type Marker = "pass" | "warn" | "fail" | "info";
interface ChecklistItem { tag: string; marker: Marker; verdict: string; detail?: string }
interface RawTag { property: string; content: string }
type ImageResult =
  | { status: "ok"; width: number; height: number; format: string; contentType: string; bytes: number }
  | { status: "error"; reason: string }
  | null;

interface OkResult {
  ok: true;
  finalUrl: string;
  elapsedMs: number;
  noOgTags: boolean;
  tags: { og: Record<string, string>; twitter: Record<string, string>; title?: string; description?: string; canonical?: string };
  raw: RawTag[];
  image: ImageResult;
  checklist: ChecklistItem[];
  summary: { pass: number; warn: number; fail: number };
}
interface ErrResult { ok: false; kind: string; status?: number }

const PLATFORMS = ["Facebook", "LinkedIn", "X", "Slack", "iMessage"] as const;
type Platform = (typeof PLATFORMS)[number];
type Tab = "All" | Platform;

function isValidish(input: string): boolean {
  const t = input.trim();
  if (t === "") return false;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

const STRIPES = "repeating-linear-gradient(135deg, #E9ECEB 0 10px, #F3F5F4 10px 20px)";

export default function OgTester() {
  const [value, setValue] = useState("https://");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<OkResult | null>(null);
  const [error, setError] = useState<ErrResult | null>(null);
  const [tab, setTab] = useState<Tab>("All");
  const [step, setStep] = useState(0); // loading step: 0 fetch,1 tags,2 image
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Prefill caret after "https://", desktop autofocus only (§4.3).
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 700px)").matches) {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }, []);

  // "fetched Ns ago" ticks each second while a result is shown.
  useEffect(() => {
    if (!fetchedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  const valid = isValidish(value);

  const run = async (raw?: string) => {
    const url = (raw ?? value).trim();
    if (!isValidish(url)) return;
    if (raw) setValue(raw);
    stepTimers.current.forEach(clearTimeout);
    setStatus("loading");
    setError(null);
    setStep(0);
    // No spinner: tick the steps forward on a gentle timer (the request returns
    // a single payload; the steps are a progress affordance).
    stepTimers.current = [
      setTimeout(() => setStep(1), 350),
      setTimeout(() => setStep(2), 900),
    ];
    try {
      const res = await fetch("/api/tools/og", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as OkResult | ErrResult;
      stepTimers.current.forEach(clearTimeout);
      if (data.ok) {
        setResult(data);
        setError(null);
        setFetchedAt(Date.now());
        setStatus("done");
      } else {
        setError(data);
        setStatus("idle");
      }
    } catch {
      stepTimers.current.forEach(clearTimeout);
      setError({ ok: false, kind: "unreachable" });
      setStatus("idle");
    }
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); run(); };

  const wide = status === "done" && result; // 1040 on results, 820 otherwise
  const buttonLabel = status === "loading" ? "Testing…" : status === "done" ? "Test again" : "Test";

  return (
    <div className={`mx-auto ${wide ? "max-w-[1040px]" : "max-w-[820px]"}`}>
      {/* Input row */}
      <form onSubmit={onSubmit} className="flex flex-col min-[560px]:flex-row gap-2.5">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Page URL"
          placeholder="https://example.com"
          className="flex-1 h-[46px] px-3.5 font-[family-name:var(--font-meta)] text-[13.5px] rounded-[var(--radius-9)] bg-[var(--color-raised)] border border-[var(--color-border-control)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus:outline-none focus:border-[var(--color-accent-deep)]"
        />
        <button
          type="submit"
          disabled={!valid || status === "loading"}
          className="h-[46px] min-[560px]:w-auto w-full px-5 rounded-[var(--radius-9)] text-[13.5px] font-semibold transition-colors disabled:bg-[var(--color-raised-soft)] disabled:border disabled:border-[var(--color-hairline)] disabled:text-[var(--color-ink-6)] disabled:cursor-not-allowed bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:brightness-110"
        >
          {buttonLabel}
        </button>
      </form>

      {/* Idle hint */}
      {status === "idle" && !error && (
        <p className="mt-2.5 text-[12.5px] text-[var(--color-ink-4)]">
          Try it with{" "}
          <button type="button" onClick={() => run("https://justnoted.app")} className="text-[var(--color-accent-text)] hover:underline">
            justnoted.app
          </button>
        </p>
      )}

      {/* Loading steps (no spinner); previous results dim to 40%. The dots
          advance visually, but nothing shows a ✓ until the response arrives —
          at which point we switch to results. */}
      {status === "loading" && (
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 font-[family-name:var(--font-meta)] text-[11.5px]">
          <Step active={step >= 0} label="Fetching page" />
          <Step active={step >= 1} label="Reading tags" />
          <Step active={step >= 2} label="Checking image" />
        </div>
      )}

      {/* Error notice */}
      {error && status !== "loading" && <ErrorNotice err={error} onRetry={() => run()} />}

      {/* Results */}
      {result && (
        <div className={status === "loading" ? "opacity-40 pointer-events-none mt-6" : "mt-6"}>
          {result.noOgTags && (
            <div className="mb-5 rounded-[var(--radius-10)] border border-[var(--color-warn-tint-border)] bg-[var(--color-warn-tint)] px-4 py-3.5">
              <div className="text-[13px] font-semibold text-[var(--color-ink)]">No OpenGraph tags found</div>
              <p className="mt-1 text-[13px] leading-[1.5] text-[var(--color-ink-3)]">
                The page loaded but has no og: tags. Platforms will guess from the &lt;title&gt; and the first image. The checklist below shows what to add.
              </p>
            </div>
          )}

          {/* Summary line */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-[family-name:var(--font-meta)] text-[12px]">
            <span className="text-[var(--color-accent-text)]">✓ {result.summary.pass} passed</span>
            <span className="text-[var(--color-warn)]">! {result.summary.warn} warning{result.summary.warn === 1 ? "" : "s"}</span>
            <span className={result.summary.fail > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ink-4)]"}>✕ {result.summary.fail} failed</span>
            <span className="ml-auto text-[var(--color-ink-5)]">
              fetched {fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : 0}s ago · {result.elapsedMs} ms
            </span>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-[var(--color-hairline)] scrollbar-thin">
            {(["All", ...PLATFORMS] as Tab[]).map((t) => {
              const on = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`shrink-0 text-[13px] px-3 py-2.5 -mb-px border-b-2 transition-colors ${
                    on ? "border-[var(--color-accent-fill)] text-[var(--color-ink)]" : "border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Previews */}
          <Previews result={result} tab={tab} />

          {/* Checklist */}
          <Checklist items={result.checklist} raw={result.raw} />
        </div>
      )}
    </div>
  );
}

// During loading a step is either reached (● ink) or not yet (○ ink-5). We never
// show a ✓ "done" tick while loading — completion is only known once the JSON
// response returns, at which point the results replace these steps.
function Step({ active, label }: { active: boolean; label: string }) {
  return <span className={active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-5)]"}>{active ? "●" : "○"} {label}</span>;
}

function ErrorNotice({ err, onRetry }: { err: ErrResult; onRetry: () => void }) {
  const map: Record<string, { level: "error" | "warn"; title: string; body: string; retry: boolean }> = {
    unreachable: { level: "error", title: "We couldn't reach that page", body: "The address didn't resolve. Check the spelling, or make sure the site is live.", retry: true },
    "blocked-status": { level: "error", title: "The site blocked our request", body: `It returned ${err.status ?? 403} ${err.status === 401 ? "Unauthorized" : "Forbidden"}. Some sites block automated fetches, and social platforms may be allowed where we aren't.`, retry: false },
    timeout: { level: "warn", title: "The page took too long", body: "No response after 10 seconds. The site may be slow or down.", retry: true },
    "http-error": { level: "error", title: "The page returned an error", body: `It responded with ${err.status ?? 500}. Check the link, or try again later.`, retry: true },
    private: { level: "error", title: "That address can't be tested", body: "We only test public websites.", retry: false },
    "rate-limited": { level: "warn", title: "Too many tests", body: "You've hit the limit of 20 tests a minute. Give it a moment and try again.", retry: true },
  };
  const m = map[err.kind] ?? map.unreachable;
  const border = m.level === "error" ? "border-[var(--color-danger-subtle)]" : "border-[var(--color-warn-tint-border)]";
  return (
    <div className={`mt-6 rounded-[var(--radius-10)] border ${border} bg-[var(--color-raised-soft)] px-4 py-3.5`}>
      <div className="text-[13px] font-semibold text-[var(--color-ink)]">{m.title}</div>
      <p className="mt-1 text-[13px] leading-[1.5] text-[var(--color-ink-3)]">{m.body}</p>
      {m.retry && (
        <button type="button" onClick={onRetry} className="mt-2.5 text-[12.5px] text-[var(--color-accent-text)] hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

// ---- Previews ---------------------------------------------------------------

function resolveImage(result: OkResult): { src: string | null; label: string } {
  const raw = result.tags.og["og:image"];
  let src: string | null = null;
  if (raw) {
    try { src = new URL(raw, result.finalUrl).toString(); } catch { src = raw; }
  }
  const img = result.image;
  const label = img && img.status === "ok" && img.width > 0
    ? `og:image · ${img.width}×${img.height}`
    : "og:image · missing";
  return { src, label };
}

function Img({ src, label, ratio = 1.91, radius = 0 }: { src: string | null; label: string; ratio?: number; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: String(ratio), background: STRIPES, borderRadius: radius, overflow: "hidden" }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: 8 }}>
          <span style={{ fontFamily: "var(--font-meta)", fontSize: 10.5, color: "#6B7280" }}>{label}</span>
        </div>
      )}
    </div>
  );
}

function domainOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

function Previews({ result, tab }: { result: OkResult; tab: Tab }) {
  const og = result.tags.og;
  const title = og["og:title"] || result.tags.title || "Your page title";
  const description = og["og:description"] || result.tags.description || "";
  const domain = domainOf(og["og:url"] || result.finalUrl);
  const { src, label } = resolveImage(result);
  const shared = { title, description, domain, src, label };

  const cards: Record<Platform, React.ReactNode> = {
    Facebook: <FacebookCard {...shared} />,
    LinkedIn: <LinkedInCard {...shared} />,
    X: <XCard {...shared} />,
    Slack: <SlackCard {...shared} />,
    iMessage: <IMessageCard {...shared} />,
  };

  const notes: Record<Platform, string> = {
    Facebook: "Facebook shows a 1.91:1 image, the title (2 lines) and one line of description. Use at least 1200×630.",
    LinkedIn: "LinkedIn shows a 1.91:1 image and the title; it ignores og:description.",
    X: "X uses twitter:card. summary_large_image gives a 1.91:1 image with the title overlaid.",
    Slack: "Slack shows a left-barred unfurl with the site name, title, description and a thumbnail.",
    iMessage: "iMessage shows a rounded bubble with the image on top and the title below.",
  };

  if (tab === "All") {
    return (
      <div className="mt-5 grid grid-cols-1 min-[640px]:grid-cols-2 min-[980px]:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => (
          <div key={p}>
            <div className="mb-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-5)]">{p}</div>
            {cards[p]}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-5 max-w-[420px] mx-auto">
      {cards[tab]}
      <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--color-ink-4)]">{notes[tab]}</p>
    </div>
  );
}

type CardProps = { title: string; description: string; domain: string; src: string | null; label: string };

function FacebookCard({ title, description, domain, src, label }: CardProps) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #DADDE1", borderRadius: 8, overflow: "hidden", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <Img src={src} label={label} />
      <div style={{ background: "#F0F2F5", padding: "10px 12px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "#65676B", letterSpacing: "0.02em" }}>{domain}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#050505", lineHeight: 1.3, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: "#65676B", lineHeight: 1.4, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{description}</div>}
      </div>
    </div>
  );
}

function LinkedInCard({ title, domain, src, label }: CardProps) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 4, overflow: "hidden", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <Img src={src} label={label} />
      <div style={{ background: "#FFFFFF", padding: "10px 12px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#191919", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#666666", marginTop: 3 }}>{domain}</div>
      </div>
    </div>
  );
}

function XCard({ title, domain, src, label }: CardProps) {
  return (
    <div style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ position: "relative", border: "1px solid #CFD9DE", borderRadius: 14, overflow: "hidden" }}>
        <Img src={src} label={label} />
        <div style={{ position: "absolute", left: 10, bottom: 10, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 12, padding: "2px 6px", borderRadius: 4, maxWidth: "85%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: "#536471", marginTop: 4 }}>From {domain}</div>
    </div>
  );
}

function SlackCard({ title, description, domain, src, label }: CardProps) {
  return (
    <div style={{ display: "flex", gap: 10, background: "#FFFFFF", borderLeft: "4px solid #DDDDDD", padding: "8px 12px", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1D1C1D" }}>{domain}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1264A3", lineHeight: 1.3, marginTop: 2 }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: "#1D1C1D", lineHeight: 1.4, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{description}</div>}
      </div>
      <div style={{ width: 90, flexShrink: 0 }}>
        <Img src={src} label={label} ratio={1.91} radius={6} />
      </div>
    </div>
  );
}

function IMessageCard({ title, domain, src, label }: CardProps) {
  return (
    <div style={{ width: "100%", maxWidth: 260, background: "#E9E9EB", borderRadius: 18, overflow: "hidden", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <Img src={src} label={label} />
      <div style={{ padding: "8px 12px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#000", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>{domain}</div>
      </div>
    </div>
  );
}

// ---- Checklist + raw tags ---------------------------------------------------

const MARK: Record<Marker, { glyph: string; color: string }> = {
  pass: { glyph: "✓", color: "var(--color-accent-text)" },
  warn: { glyph: "!", color: "var(--color-warn)" },
  fail: { glyph: "✕", color: "var(--color-danger)" },
  info: { glyph: "i", color: "var(--color-ink-4)" },
};

function verdictColor(m: Marker): string {
  if (m === "warn") return "var(--color-warn)";
  if (m === "fail") return "var(--color-danger)";
  return "var(--color-ink-3)";
}

function Checklist({ items, raw }: { items: ChecklistItem[]; raw: RawTag[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyHtml = async () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const lines = raw.map((r) => {
      if (r.property === "title") return `<title>${esc(r.content)}</title>`;
      if (r.property === "description") return `<meta name="description" content="${esc(r.content)}">`;
      if (r.property === "canonical") return `<link rel="canonical" href="${esc(r.content)}">`;
      if (r.property.startsWith("twitter:")) return `<meta name="${r.property}" content="${esc(r.content)}">`;
      return `<meta property="${r.property}" content="${esc(r.content)}">`;
    });
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };

  return (
    <div className="mt-8 border-t border-[var(--color-hairline)]">
      {items.map((it) => (
        <div key={it.tag} className="grid grid-cols-[22px_minmax(0,1fr)] min-[560px]:grid-cols-[22px_180px_minmax(0,1fr)] gap-x-2 gap-y-0.5 py-[11px] border-b border-[var(--color-hairline-soft)] text-[13px]">
          <span style={{ color: MARK[it.marker].color, fontWeight: 700 }}>{MARK[it.marker].glyph}</span>
          <span className="font-[family-name:var(--font-meta)] text-[var(--color-ink-1)] break-words">{it.tag}</span>
          <span className="col-start-2 min-[560px]:col-start-3" style={{ color: verdictColor(it.marker) }}>
            {it.verdict}
            {it.detail && <span className="text-[var(--color-ink-4)]"> · {it.detail}</span>}
          </span>
        </div>
      ))}

      {/* Raw tags disclosure */}
      <div className="flex items-center justify-between py-[11px]">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-1)]">
          <IconChevronRight size={14} className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
          Raw tags <span className="font-[family-name:var(--font-meta)] text-[var(--color-ink-4)]">{raw.length}</span>
        </button>
        <button type="button" onClick={copyHtml} className="text-[12.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors">
          {copied ? "Copied" : "Copy as HTML"}
        </button>
      </div>
      {open && (
        <div className="mb-4 rounded-[var(--radius-8)] bg-[var(--color-canvas)] border border-[var(--color-hairline)] overflow-x-auto">
          {raw.map((r, i) => (
            <div key={i} className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 px-3 py-2 border-b border-[var(--color-hairline-soft)] last:border-0 font-[family-name:var(--font-meta)] text-[12.5px]">
              <span className="text-[var(--color-ink-1)] break-words">{r.property}</span>
              <span className="text-[var(--color-ink-3)] break-words">{r.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
