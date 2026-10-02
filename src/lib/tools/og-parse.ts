// Parse OpenGraph / Twitter / title / description / canonical tags from an HTML
// string (spec §8.3). Pure and testable — no DOM. We only read <meta>, <title>
// and <link rel="canonical">, which a regex scan handles safely for our use
// (we never execute or render the HTML).

export interface RawTag {
  property: string; // og:title, twitter:card, title, description, canonical
  content: string;
}

export interface ParsedTags {
  og: Record<string, string>;
  twitter: Record<string, string>;
  title?: string;
  description?: string;
  canonical?: string;
  raw: RawTag[];
}

// Decode the handful of HTML entities that appear in attribute values.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

// Pull name="…"/property="…"/content="…" (or single-quoted / unquoted) out of a
// tag's attribute string.
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

export function parseTags(html: string): ParsedTags {
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const raw: RawTag[] = [];
  let title: string | undefined;
  let description: string | undefined;
  let canonical: string | undefined;

  // Limit the scan to <head> when present — faster and avoids body noise — but
  // fall back to the whole document if there's no clear head.
  const headMatch = html.match(/<head[\s>][\s\S]*?<\/head>/i);
  const scope = headMatch ? headMatch[0] : html;

  // <title>
  const titleMatch = scope.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim());
    if (title) raw.push({ property: "title", content: title });
  }

  // <meta …>
  const metaRe = /<meta\b[^>]*>/gi;
  for (const m of scope.matchAll(metaRe)) {
    const tag = m[0];
    const content = attr(tag, "content");
    if (content === null) continue;
    const property = (attr(tag, "property") ?? "")?.toLowerCase();
    const metaName = (attr(tag, "name") ?? "")?.toLowerCase();

    if (property.startsWith("og:")) {
      if (!(property in og)) og[property] = content; // first wins
      raw.push({ property, content });
    } else if (metaName.startsWith("twitter:")) {
      if (!(metaName in twitter)) twitter[metaName] = content;
      raw.push({ property: metaName, content });
    } else if (metaName.startsWith("og:")) {
      // Some sites (incorrectly) use name= for og — accept it.
      if (!(metaName in og)) og[metaName] = content;
      raw.push({ property: metaName, content });
    } else if (metaName === "description") {
      if (description === undefined) {
        description = content;
        raw.push({ property: "description", content });
      }
    }
  }

  // <link rel="canonical" href="…">
  const linkRe = /<link\b[^>]*>/gi;
  for (const m of scope.matchAll(linkRe)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (rel === "canonical") {
      const href = attr(tag, "href");
      if (href) {
        canonical = href;
        raw.push({ property: "canonical", content: href });
      }
      break;
    }
  }

  return { og, twitter, title, description, canonical, raw };
}

// Does the document have ANY og: tag? (§8.3 "No OpenGraph tags found".)
export function hasOgTags(tags: ParsedTags): boolean {
  return Object.keys(tags.og).length > 0;
}
