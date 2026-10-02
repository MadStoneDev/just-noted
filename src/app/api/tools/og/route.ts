import { NextResponse } from "next/server";
import { checkRateLimit } from "@/utils/rate-limit";
import { safeFetch, validateUrl, LIMITS, SsrfError } from "@/lib/tools/ssrf";
import { parseTags, hasOgTags } from "@/lib/tools/og-parse";
import { imageDimensions } from "@/lib/tools/image-meta";
import { analyze, type ImageResult } from "@/lib/tools/og-analyze";

// The SSRF module uses node dns/net/http/https, so this route must be Node, not
// Edge. force-dynamic: every test is live; nothing is cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// Client IP for rate limiting. Behind Coolify/Traefik, Traefik sets X-Real-IP
// to the real client and appends it to the RIGHT of X-Forwarded-For. We must
// NOT trust the leftmost XFF entry (client-spoofable) — use X-Real-IP, else the
// rightmost XFF hop.
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

// Map an SsrfError to the public error kind the UI renders copy for (§8.3).
// Never leaks the resolved IP or the internal message.
function errorKind(code: SsrfError["code"]): { kind: string; status: number } {
  switch (code) {
    case "blocked-host":
    case "blocked-scheme":
    case "blocked-port":
      return { kind: "private", status: 400 };
    case "dns-failed":
    case "invalid-url":
      return { kind: "unreachable", status: 400 };
    case "timeout":
      return { kind: "timeout", status: 504 };
    case "too-large":
    case "too-many-redirects":
    case "fetch-failed":
    default:
      return { kind: "unreachable", status: 502 };
  }
}

function normalizeInput(raw: string): string {
  const t = raw.trim();
  if (t === "") return t;
  // Bare domains get https:// (spec §8.3 input row).
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

export async function POST(request: Request) {
  const started = Date.now();

  // Rate limit first (20/min/IP, shared Redis, fails closed).
  const ip = clientIp(request);
  const rl = await checkRateLimit(ip, "og-tester", RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, kind: "rate-limited" }, { status: 429 });
  }

  let input = "";
  try {
    const body = await request.json();
    input = typeof body?.url === "string" ? body.url : "";
  } catch {
    return NextResponse.json({ ok: false, kind: "unreachable" }, { status: 400 });
  }

  const url = normalizeInput(input);
  // Reject early (also catches scheme/port/credential/numeric-host issues).
  let tested: string;
  try {
    tested = validateUrl(url).url.toString();
  } catch (e) {
    if (e instanceof SsrfError) {
      const { kind, status } = errorKind(e.code);
      return NextResponse.json({ ok: false, kind }, { status });
    }
    return NextResponse.json({ ok: false, kind: "unreachable" }, { status: 400 });
  }

  // Fetch the HTML.
  let page;
  try {
    page = await safeFetch(tested, {
      maxBytes: LIMITS.maxHtmlBytes,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
    });
  } catch (e) {
    const code = e instanceof SsrfError ? e.code : "fetch-failed";
    // Log at most the hostname — never the full tested URL (store nothing).
    try { console.warn("[og-tester] fetch failed", new URL(tested).hostname, code); } catch {}
    const { kind, status } = errorKind(code as SsrfError["code"]);
    return NextResponse.json({ ok: false, kind }, { status });
  }

  // HTTP-status errors (§8.3).
  if (page.status === 401 || page.status === 403) {
    return NextResponse.json({ ok: false, kind: "blocked-status", status: page.status }, { status: 200 });
  }
  if (page.status >= 400) {
    return NextResponse.json({ ok: false, kind: "http-error", status: page.status }, { status: 200 });
  }

  const tags = parseTags(page.body.toString("utf8"));

  // Probe og:image (same SSRF-hardened path), if present.
  let image: ImageResult = null;
  const imgUrl = tags.og["og:image"];
  if (imgUrl) {
    try {
      const resolved = new URL(imgUrl, page.finalUrl).toString();
      const imgRes = await safeFetch(resolved, {
        maxBytes: LIMITS.maxImageBytes,
        accept: "image/*",
        deadline: started + LIMITS.timeoutMs, // share the overall budget
      });
      if (imgRes.status >= 400) {
        image = { status: "error", reason: "http-error" };
      } else if (!/^image\//i.test(imgRes.contentType)) {
        image = { status: "error", reason: "not-image" };
      } else {
        const dims = imageDimensions(imgRes.body);
        image = {
          status: "ok",
          width: dims?.width ?? 0,
          height: dims?.height ?? 0,
          format: dims?.format ?? "",
          contentType: imgRes.contentType.split(";")[0].trim(),
          bytes: imgRes.body.length,
        };
      }
    } catch (e) {
      const code = e instanceof SsrfError ? e.code : "fetch-failed";
      image = { status: "error", reason: code === "too-large" ? "too-large" : code === "blocked-host" ? "http-error" : "fetch-failed" };
    }
  }

  const analysis = analyze(tags, page.finalUrl, image);

  return NextResponse.json({
    ok: true,
    finalUrl: page.finalUrl,
    elapsedMs: Date.now() - started,
    noOgTags: !hasOgTags(tags),
    tags: { og: tags.og, twitter: tags.twitter, title: tags.title, description: tags.description, canonical: tags.canonical },
    raw: tags.raw,
    image,
    checklist: analysis.items,
    summary: analysis.summary,
  });
}
