// Build the OG tester checklist and summary from parsed tags + the og:image
// probe (spec §8.3). Pure and testable. The route supplies the image result;
// this module never touches the network.

import type { ParsedTags } from "./og-parse";

export type Marker = "pass" | "warn" | "fail" | "info";

export interface ChecklistItem {
  tag: string;
  marker: Marker;
  verdict: string;
  detail?: string; // ink-4 suffix on a pass (e.g. "58 chars")
}

export type ImageResult =
  | { status: "ok"; width: number; height: number; format: string; contentType: string; bytes: number }
  | { status: "error"; reason: "not-image" | "http-error" | "too-large" | "fetch-failed" }
  | null; // null = no og:image tag to probe

export interface Analysis {
  items: ChecklistItem[];
  summary: { pass: number; warn: number; fail: number };
}

const TITLE_MAX = 60;
const DESC_MAX = 155;
const MIN_W = 1200;
const MIN_H = 630;
const TARGET_RATIO = 1.91;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return u.trim().replace(/\/$/, "");
  }
}

const MARKER_ORDER: Record<Marker, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

export function analyze(tags: ParsedTags, testedUrl: string, image: ImageResult): Analysis {
  const og = tags.og;
  const tw = tags.twitter;
  const items: ChecklistItem[] = [];
  const add = (tag: string, marker: Marker, verdict: string, detail?: string) =>
    items.push({ tag, marker, verdict, detail });

  // og:title
  {
    const v = og["og:title"];
    if (!v) add("og:title", "fail", "Missing");
    else if (v.length > TITLE_MAX) add("og:title", "warn", `${v.length} characters. Most platforms cut titles off around ${TITLE_MAX}.`);
    else add("og:title", "pass", v, `${v.length} chars`);
  }

  // og:description
  {
    const v = og["og:description"];
    if (!v) add("og:description", "warn", "Missing. Platforms will use the page's meta description or nothing.");
    else if (v.length > DESC_MAX) add("og:description", "warn", `${v.length} characters. Facebook cuts off around ${DESC_MAX}, so put the key point first.`);
    else add("og:description", "pass", truncate(v, 80));
  }

  // og:image
  {
    const v = og["og:image"];
    if (!v) {
      add("og:image", "fail", "Missing");
    } else if (!image || image.status === "error") {
      const reason = image?.status === "error" ? image.reason : "fetch-failed";
      if (reason === "too-large") add("og:image", "warn", "The image is over 5 MB. Compress it so cards load quickly.");
      else if (reason === "not-image") add("og:image", "fail", "The URL doesn't return an image.");
      else if (reason === "http-error") add("og:image", "fail", "The image URL returned an error.");
      else add("og:image", "fail", "We couldn't load the image.");
    } else {
      const { width, height, contentType, bytes } = image;
      const hasDims = width > 0 && height > 0;
      const sizeStr = hasDims
        ? `${width}×${height} · ${contentType} · ${formatBytes(bytes)}`
        : `${contentType} · ${formatBytes(bytes)}`;
      if (width > 0 && height > 0 && (width < MIN_W || height < MIN_H)) {
        add("og:image", "warn", `${width}×${height}. Use at least ${MIN_W}×${MIN_H} so the image stays sharp on large cards.`);
      } else if (width > 0 && height > 0 && Math.abs(width / height - TARGET_RATIO) / TARGET_RATIO > 0.1) {
        add("og:image", "warn", `${width}×${height} is ${(width / height).toFixed(2)}:1, so it will be cropped. Aim for ${TARGET_RATIO}:1.`);
      } else {
        add("og:image", "pass", sizeStr);
      }
    }
  }

  // og:url
  {
    const v = og["og:url"];
    if (!v) add("og:url", "warn", "Missing.");
    else if (normalizeUrl(v) !== normalizeUrl(testedUrl)) add("og:url", "warn", `Points to ${v}, not the page you tested.`);
    else add("og:url", "pass", "Matches the tested URL");
  }

  // og:type
  {
    const v = og["og:type"];
    if (!v) add("og:type", "warn", "Missing. Defaults to website.");
    else add("og:type", "pass", v);
  }

  // og:site_name (info if missing)
  {
    const v = og["og:site_name"];
    if (!v) add("og:site_name", "info", "Not set. Optional.");
    else add("og:site_name", "pass", v);
  }

  // twitter:card
  {
    const v = tw["twitter:card"];
    if (!v) add("twitter:card", "warn", "Missing. X will show a small card. Use summary_large_image for a big image.");
    else add("twitter:card", "pass", v);
  }

  // twitter:title / description / image (info if missing)
  for (const x of ["title", "description", "image"] as const) {
    const key = `twitter:${x}`;
    const v = tw[key];
    if (!v) add(key, "info", `Not set, X will use og:${x}. That's fine.`);
    else add(key, "pass", v);
  }

  items.sort((a, b) => MARKER_ORDER[a.marker] - MARKER_ORDER[b.marker]); // stable: fails, warnings, passes, info

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const it of items) {
    if (it.marker === "pass") summary.pass++;
    else if (it.marker === "warn") summary.warn++;
    else if (it.marker === "fail") summary.fail++;
  }

  return { items, summary };
}
