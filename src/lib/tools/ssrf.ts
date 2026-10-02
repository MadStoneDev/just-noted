// SSRF-hardened fetch for the Open Graph tester (spec §8.3).
//
// Threat model: the URL is attacker-controlled. We must never let it reach a
// private, local or otherwise non-public address, directly or via DNS
// rebinding or redirects. Strategy:
//   1. Validate scheme (http/https) and port (80/443 only) with no DNS.
//   2. Resolve the hostname ourselves, validate EVERY resolved IP, and if any
//      is non-public, refuse (defends against split-horizon / rebinding).
//   3. Connect to the validated IP literal — never re-resolve — so the socket
//      cannot land on a different address than the one we checked (DNS pinning).
//   4. Re-run all of the above on every redirect hop, and on the og:image URL.
//   5. Cap time (10s total), redirects (5), and bytes (1MB HTML / 5MB image).
//   6. Send an identifying User-Agent. Store nothing.
//
// This module must run on the Node.js runtime (it uses dns/net/http/https).

import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export const LIMITS = {
  timeoutMs: 10_000,
  maxRedirects: 5,
  maxHtmlBytes: 1_000_000, // 1 MB
  maxImageBytes: 5_000_000, // 5 MB
};

export const USER_AGENT =
  "JustNotedOGTester/1.0 (+https://justnoted.app/tools/og-tester)";

export type SsrfErrorCode =
  | "invalid-url"
  | "blocked-scheme"
  | "blocked-port"
  | "blocked-host"
  | "dns-failed"
  | "too-large"
  | "timeout"
  | "too-many-redirects"
  | "fetch-failed";

export class SsrfError extends Error {
  constructor(public code: SsrfErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SsrfError";
  }
}

// ---- IP classification (pure) ----------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Expand an IPv6 string to 16 bytes, handling "::" and a trailing IPv4 tail.
export function ipv6ToBytes(ip: string): Uint8Array | null {
  let s = ip;
  // Strip a zone id (fe80::1%eth0).
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct);

  const dbl = s.split("::");
  if (dbl.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const tokens = part.split(":");
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.includes(".")) {
        // Embedded IPv4 (only valid as the last token).
        if (i !== tokens.length - 1) return null;
        const v4 = ipv4ToInt(tok);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(tok)) return null;
        out.push(parseInt(tok, 16));
      }
    }
    return out;
  };

  let groups: number[];
  if (dbl.length === 2) {
    const head = parseGroups(dbl[0]);
    const tail = parseGroups(dbl[1]);
    if (head === null || tail === null) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill(0), ...tail];
  } else {
    const g = parseGroups(s);
    if (g === null) return null;
    groups = g;
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = (groups[i] >> 8) & 0xff;
    bytes[i * 2 + 1] = groups[i] & 0xff;
  }
  return bytes;
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as blocked
  const inCidr = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inCidr("0.0.0.0", 8) ||        // "this" network
    inCidr("10.0.0.0", 8) ||       // private
    inCidr("100.64.0.0", 10) ||    // CGNAT
    inCidr("127.0.0.0", 8) ||      // loopback
    inCidr("169.254.0.0", 16) ||   // link-local
    inCidr("172.16.0.0", 12) ||    // private
    inCidr("192.0.0.0", 24) ||     // IETF protocol assignments
    inCidr("192.0.2.0", 24) ||     // TEST-NET-1
    inCidr("192.88.99.0", 24) ||   // 6to4 relay anycast
    inCidr("192.168.0.0", 16) ||   // private
    inCidr("198.18.0.0", 15) ||    // benchmarking
    inCidr("198.51.100.0", 24) ||  // TEST-NET-2
    inCidr("203.0.113.0", 24) ||   // TEST-NET-3
    inCidr("224.0.0.0", 4) ||      // multicast
    inCidr("240.0.0.0", 4)         // reserved (incl. 255.255.255.255 broadcast)
  );
}

function isBlockedIPv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true;

  // IPv4-mapped (::ffff:a.b.c.d) — block outright (can be used to smuggle v4).
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) return true;
  // IPv4-compatible (deprecated) ::a.b.c.d
  if (b.slice(0, 12).every((x) => x === 0) && !(b[12] === 0 && b[13] === 0 && b[14] === 0)) return true;
  // NAT64 well-known prefix 64:ff9b::/96
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return true;
  // :: (unspecified) and ::1 (loopback)
  if (b.slice(0, 15).every((x) => x === 0) && (b[15] === 0 || b[15] === 1)) return true;
  // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
  // fc00::/7 unique local
  if ((b[0] & 0xfe) === 0xfc) return true;
  // ff00::/8 multicast
  if (b[0] === 0xff) return true;
  // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true;

  return false;
}

// True only for a normal, routable public address.
export function isPublicIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return !isBlockedIPv4(ip);
  if (kind === 6) return !isBlockedIPv6(ip);
  return false;
}

// Canonicalise an IPv4 host given in any inet_aton form — decimal int
// (2130706433), hex (0x7f.0.0.1), octal (0177.0.0.1 / 017700000001), or 1–4
// parts — to a dotted quad. Returns null if the host isn't an IPv4 literal (so
// it's treated as a DNS name). This stops a numeric host from slipping past the
// IP check and being normalised to a private address only at connect time.
export function canonicalIpv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "" || !/^(0x[0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*|0)$/.test(p)) return null;
    let val: number;
    if (/^0x/i.test(p)) val = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) val = parseInt(p, 8);
    else val = parseInt(p, 10);
    if (!Number.isFinite(val) || val < 0) return null;
    nums.push(val);
  }
  const maxLast = [0xffffffff, 0xffffff, 0xffff, 0xff][nums.length - 1];
  if (nums[nums.length - 1] > maxLast) return null;
  if (nums.slice(0, -1).some((x) => x > 0xff)) return null;
  let n: number;
  if (nums.length === 1) n = nums[0] >>> 0;
  else if (nums.length === 2) n = ((nums[0] << 24) | nums[1]) >>> 0;
  else if (nums.length === 3) n = ((nums[0] << 24) | (nums[1] << 16) | nums[2]) >>> 0;
  else n = ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

// ---- URL validation (pure, no DNS) -----------------------------------------

export interface ValidUrl {
  url: URL;
  hostname: string; // an IP literal when the host resolves to one statically
  port: number;
}

// Validate scheme, port, credentials and host, and reject any IP-literal or
// numeric host that isn't public. Does NOT resolve DNS names — that happens in
// the fetch, pinned.
export function validateUrl(raw: string): ValidUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("invalid-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("blocked-scheme");
  }
  // No embedded credentials (user:pass@host) — a common SSRF/obfuscation vector.
  if (url.username !== "" || url.password !== "") {
    throw new SsrfError("invalid-url");
  }
  // Ports: only the defaults or an explicit 80/443.
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    throw new SsrfError("blocked-port");
  }

  let hostname = url.hostname.replace(/^\[|\]$/g, ""); // unwrap [::1]
  if (!hostname) throw new SsrfError("invalid-url");

  // localhost and the .localhost TLD must never be fetched (no DNS needed).
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new SsrfError("blocked-host");
  }

  // Standard IP literal (dotted IPv4 or IPv6) — validate immediately.
  if (net.isIP(hostname) !== 0) {
    if (!isPublicIp(hostname)) throw new SsrfError("blocked-host");
  } else {
    // A numeric IPv4 in disguise (decimal/hex/octal/short forms)? Canonicalise
    // and validate; pin to the dotted quad so no later re-resolution occurs.
    const v4 = canonicalIpv4(hostname);
    if (v4) {
      if (!isPublicIp(v4)) throw new SsrfError("blocked-host");
      hostname = v4;
    }
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  return { url, hostname, port };
}

// ---- DNS resolution + validation -------------------------------------------

// Resolve the hostname and return a single validated IP to pin the connection
// to. If ANY resolved address is non-public, refuse the whole host.
async function resolvePinnedIp(hostname: string): Promise<string> {
  if (net.isIP(hostname) !== 0) {
    if (!isPublicIp(hostname)) throw new SsrfError("blocked-host");
    return hostname;
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    throw new SsrfError("dns-failed");
  }
  if (addrs.length === 0) throw new SsrfError("dns-failed");
  for (const a of addrs) {
    if (!isPublicIp(a.address)) throw new SsrfError("blocked-host");
  }
  return addrs[0].address;
}

// ---- The pinned fetch -------------------------------------------------------

export interface FetchResult {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: string;
}

export interface FetchOptions {
  maxBytes: number;
  accept: string;
  deadline?: number; // epoch ms; shared across redirect hops
}

// Fetch a URL with full SSRF protection, following up to LIMITS.maxRedirects
// redirects and re-validating every hop. Used for both the HTML page and the
// og:image (different maxBytes).
export async function safeFetch(rawUrl: string, opts: FetchOptions): Promise<FetchResult> {
  const deadline = opts.deadline ?? Date.now() + LIMITS.timeoutMs;
  let current = rawUrl;

  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    const { url, hostname, port } = validateUrl(current);
    const pinnedIp = await resolvePinnedIp(hostname);
    if (Date.now() >= deadline) throw new SsrfError("timeout");

    const res = await requestOnce(url, hostname, port, pinnedIp, opts, deadline);

    // Redirect?
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop === LIMITS.maxRedirects) throw new SsrfError("too-many-redirects");
      // Resolve relative redirects against the current URL, then re-validate.
      current = new URL(res.location, url).toString();
      continue;
    }
    return { status: res.status, contentType: res.contentType, body: res.body, finalUrl: url.toString() };
  }
  throw new SsrfError("too-many-redirects");
}

interface OnceResult {
  status: number;
  contentType: string;
  location: string | null;
  body: Buffer;
}

// Read a response body with the byte cap applied to DECOMPRESSED bytes, so a
// compressed "zip bomb" can't blow past the limit. Even if the server ignores
// our `Accept-Encoding: identity` and sends gzip/deflate/br, we decompress with
// the cap on output (and also cap the compressed input). An unknown encoding is
// rejected rather than guessed.
export async function readBodyCapped(stream: Readable, encoding: string, maxBytes: number): Promise<Buffer> {
  const enc = encoding.toLowerCase().trim();
  let decomp: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null;
  if (enc && enc !== "identity") {
    if (enc === "gzip" || enc === "x-gzip") decomp = zlib.createGunzip();
    else if (enc === "deflate") decomp = zlib.createInflate();
    else if (enc === "br") decomp = zlib.createBrotliDecompress();
    else throw new SsrfError("fetch-failed", "unsupported content-encoding");
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let outTotal = 0;
    let compTotal = 0;
    let settled = false;
    const fail = (e: SsrfError) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      decomp?.destroy();
      reject(e);
    };
    const finish = () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } };

    if (decomp) {
      // Cap the compressed input too, so a bomb can't even be fully buffered.
      stream.on("data", (c: Buffer) => {
        compTotal += c.length;
        if (compTotal > maxBytes) fail(new SsrfError("too-large"));
      });
      stream.pipe(decomp);
      decomp.on("error", () => fail(new SsrfError("fetch-failed")));
    }
    stream.on("error", () => fail(new SsrfError("fetch-failed")));

    const out: Readable = decomp ?? stream;
    out.on("data", (c: Buffer) => {
      outTotal += c.length;
      if (outTotal > maxBytes) { fail(new SsrfError("too-large")); return; }
      chunks.push(c);
    });
    out.on("end", finish);
  });
}

function requestOnce(
  url: URL,
  hostname: string,
  port: number,
  pinnedIp: string,
  opts: FetchOptions,
  deadline: number,
): Promise<OnceResult> {
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new SsrfError("timeout"));

  const hostHeader = (port === 80 || port === 443) ? hostname : `${hostname}:${port}`;

  return new Promise<OnceResult>((resolve, reject) => {
    const req = transport.request(
      {
        host: pinnedIp, // connect to the validated IP literal — no re-resolution
        port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isHttps ? hostname : undefined, // SNI + cert check vs real host
        rejectUnauthorized: true,
        headers: {
          Host: hostHeader,
          "User-Agent": USER_AGENT,
          Accept: opts.accept,
          "Accept-Encoding": "identity",
        },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        const location = res.headers.location ? String(res.headers.location) : null;

        // Don't download the body of a redirect.
        if (status >= 300 && status < 400 && location) {
          res.destroy();
          resolve({ status, contentType, location, body: Buffer.alloc(0) });
          return;
        }

        const encoding = String(res.headers["content-encoding"] ?? "");
        readBodyCapped(res, encoding, opts.maxBytes)
          .then((body) => resolve({ status, contentType, location: null, body }))
          .catch((e) => { req.destroy(); reject(e instanceof SsrfError ? e : new SsrfError("fetch-failed")); });
      },
    );

    req.on("timeout", () => { req.destroy(); reject(new SsrfError("timeout")); });
    req.on("error", (e) => reject(e instanceof SsrfError ? e : new SsrfError("fetch-failed", (e as Error).message)));
    req.end();
  });
}

// Rate limiting lives in the route, backed by the shared Redis limiter
// (src/utils/rate-limit.ts checkRateLimit) so it survives redeploys and spans
// instances. See the og route for the 20/min/IP policy and client-IP handling.
