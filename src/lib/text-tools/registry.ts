// Tool catalogue — pure data, imported by the grid, the per-tool views, the
// server-side metadata, and route guards. Add a tool here and wire its component
// in tool-view.tsx. Phase-2 tools appear on the grid as "Coming soon" cards and
// have NO route until they ship (the marker page 404s them).

export interface ToolFaq {
  q: string;
  a: string;
}

export interface ToolMeta {
  slug: string;
  /** H1 / breadcrumb / card name (spec casing, e.g. "Slug generator"). */
  name: string;
  /** 1 = live (routable). 2 = coming soon (grid card only, no route yet). */
  phase: 1 | 2;
  /** Typographic icon shown in the card tile (spec §3.3). */
  glyph: string;
  /** Font family for the glyph. */
  glyphFont: "mono" | "editor";
  /** One-line H1 description (§4.2) — also the meta description. */
  description: string;
  /** Grid card description (§3.3, exact copy). */
  cardDescription: string;
  /** Short description for the mobile list (§9.2). */
  mobileDescription: string;
  /** <title> (approved, keyword-first, brand last, ≤60). */
  title: string;
  /** How-it-works paragraphs (§x.7) — live tools only. */
  howItWorks: string[];
  /** FAQ (first item open) — live tools only. */
  faq?: ToolFaq[];
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "slug-generator",
    name: "Slug generator",
    phase: 1,
    glyph: "a-b",
    glyphFont: "mono",
    title: "Slug Generator: Turn Titles into URL Slugs | JustNoted",
    description: "Turn any title into a clean, URL-safe slug. It updates as you type.",
    cardDescription: "Turn any title into a clean, URL-safe slug, one at a time or in bulk.",
    mobileDescription: "Titles into clean, URL-safe slugs.",
    howItWorks: [
      "Type or paste a title and the slug updates as you go. Letters are lowercased, accents become their plain equivalents (é becomes e), and anything that isn't a letter or number turns into a hyphen.",
      "With Remove filler words on, short words like a, the, and, of and to are dropped. That keeps slugs short without losing their meaning. Max length always trims at a word boundary, so you never end up with half a word.",
      "Batch mode takes one title per line and gives back one slug per line. If two titles produce the same slug, the second gets -2 and the third -3, so every slug in the batch is unique.",
    ],
    faq: [
      {
        q: "What is a slug?",
        a: "The part of a URL that names a page. In justnoted.app/blog/write-without-distractions, the slug is write-without-distractions.",
      },
      {
        q: "Which words count as filler?",
        a: "a, an, the, and, or, but, nor, of, to, in, on, at, by, for, with, from, as, into, onto, than, that, this, is, are, was, be. If removing them would leave nothing, they're all kept.",
      },
      {
        q: "Does it work with other languages?",
        a: "Accented Latin letters are converted (é → e, ß → ss). Other scripts, like Chinese, Arabic or Cyrillic, aren't transliterated yet, so they're left out of the slug.",
      },
    ],
  },
  {
    slug: "case-converter",
    name: "Case converter",
    phase: 1,
    glyph: "Aa",
    glyphFont: "editor",
    title: "Case Converter: Change Text Case Online | JustNoted",
    description: "Change the case of any text, or clean it up. Changes are made in place, and every one can be undone.",
    cardDescription: "Change case, convert to camelCase or snake_case, and clean up messy text.",
    mobileDescription: "Change case and clean up text.",
    howItWorks: [
      "Paste or type your text, then pick a change from the panel on the right. Each button is written in the style it produces, so you can scan for the result you want.",
      "Changes happen in place. Select part of the text to change only that part. Every change can be undone with Undo or the keyboard, and you can undo up to 50 steps.",
      "Title Case keeps short words like “of”, “and” and “the” in lowercase, the way headlines are usually written. Capitalise Every Word capitalises all of them.",
    ],
    faq: [
      {
        q: "What's the difference between Title Case and Capitalise Every Word?",
        a: "Title Case lowercases small words like of, and and the unless they're first or last. Capitalise Every Word capitalises the first letter of every word, with no exceptions.",
      },
      {
        q: "How does camelCase handle existing capitals?",
        a: "It splits on spaces, underscores, hyphens, dots and lowercase→uppercase transitions, so readingTime becomes reading time first, then recombines in the case you picked.",
      },
      {
        q: "Does Strip Markdown keep links?",
        a: "It keeps the link text and drops the URL and brackets, so [JustNoted](https://justnoted.app) becomes JustNoted.",
      },
    ],
  },
  {
    slug: "word-counter",
    name: "Word counter",
    phase: 1,
    glyph: "123",
    glyphFont: "mono",
    title: "Word Counter: Count Words & Reading Time | JustNoted",
    description: "Count words, characters and sentences, and see reading time and your most-used words.",
    cardDescription: "Words, reading time and keyword frequency.",
    mobileDescription: "Words, reading time and keywords.",
    howItWorks: [
      "Paste or type your text and the counts update as you go — words, characters (with and without spaces), sentences and paragraphs. A word is a run of letters or numbers, so don't and well-known each count as one.",
      "Reading time assumes 238 words a minute and speaking time 130, the averages from reading-speed research. They're an estimate, not a stopwatch, but they're handy for sizing a post or a talk.",
      "Keywords show your most-used words and phrases. Switch between single words and two- or three-word phrases, and turn off Exclude common words to include the, and, of and the like. Phrases never run across the end of a sentence.",
    ],
    faq: [
      {
        q: "How is a word counted?",
        a: "A word is a run of letters or numbers, keeping internal apostrophes and hyphens — so don't and well-known are one word each. It's the same rule the live counts use across the tools.",
      },
      {
        q: "How are sentences and paragraphs detected?",
        a: "Sentences end at a full stop, question mark or exclamation mark followed by a space or the end of the text, ignoring abbreviations like Dr. and e.g. and decimals like 3.14. A paragraph is a block of text separated from the next by a blank line.",
      },
      {
        q: "Why don't my keywords include words like “the”?",
        a: "Common words are hidden by default so the list shows what your text is actually about. Turn off Exclude common words to count every word. Terms are lowercased and shown as-is, with no stemming.",
      },
    ],
  },
  {
    slug: "serp-preview",
    name: "Search result preview",
    phase: 1,
    glyph: "…",
    glyphFont: "mono",
    title: "SERP Preview: Check Title & Description Length | JustNoted",
    description: "See how your page will look in search results, and where the title and description get cut off.",
    cardDescription: "See where your title and description get cut off.",
    mobileDescription: "Where your title and description get cut off.",
    howItWorks: [
      "Type your page title, URL and meta description on the left and the result card on the right updates as you go. It's a neutral preview — not tied to any one search engine.",
      "Search engines cut titles and descriptions by how wide they are in pixels, not how many characters they have, so a title full of wide letters is cut sooner than its character count suggests. This tool measures the real width in the same font search results use and tells you where the text would be cut and roughly how much to trim.",
      "The counters still show characters against the usual guides — about 60 for the title and 160 for the description — so you have both the quick number and the accurate pixel check.",
    ],
    faq: [
      {
        q: "Why does my title get cut before 60 characters?",
        a: "Because truncation is by pixel width, not character count. Wide letters like m and w take more room, so a title of wide words can be cut well before 60 characters, while a narrow one can run past it.",
      },
      {
        q: "Will my title and description show exactly like this?",
        a: "Not always. Search engines often rewrite titles and descriptions to match the search, and they vary the exact cut-off. Treat the card as a close approximation, not a guarantee.",
      },
      {
        q: "Does my text get sent anywhere?",
        a: "No. The preview is measured entirely in your browser — nothing you type is sent to a server.",
      },
    ],
  },
  {
    slug: "og-tester",
    name: "Open Graph tester",
    phase: 1,
    glyph: "og:",
    glyphFont: "mono",
    title: "Open Graph Tester: Preview How Links Share | JustNoted",
    description: "See how a link will look when it's shared, and which tags are missing.",
    cardDescription: "Preview a link on Facebook, LinkedIn, X, Slack and iMessage.",
    mobileDescription: "Preview how a link looks when shared.",
    howItWorks: [
      "Paste a public URL and we fetch the page, read its Open Graph and Twitter Card tags, and show how the link would look when it's shared. Nothing is stored — no cache, no log of what you tested.",
      "Open Graph is a set of <meta> tags (og:title, og:description, og:image and friends) that tell Facebook, LinkedIn, Slack and others what to show. Twitter Cards do the same for X. When they're missing, platforms guess from your title and the first image on the page, which rarely looks as good.",
      "The checklist flags what's missing or off — a title that's too long, an image smaller than 1200×630 or the wrong shape, a missing card type — in the order worth fixing. The previews are neutral approximations: real platforms vary, but the proportions and cut-off points match.",
    ],
    faq: [
      {
        q: "Why does my image look stretched or cropped in the preview?",
        a: "Most platforms crop to 1.91:1 (about 1200×630). If your og:image is a different shape it gets cropped to fit; if it's smaller than 1200×630 it can look soft on large cards. The checklist tells you the actual size it found.",
      },
      {
        q: "It says no tags found, but I can see them in my code.",
        a: "Some sites add Open Graph tags with JavaScript after the page loads, or behind a check that blocks automated fetches. We read the HTML the server sends, like the social platforms do, so tags added later won't be seen — add them to the server-rendered HTML.",
      },
      {
        q: "Do you store the URLs I test?",
        a: "No. We fetch the page to read its tags and return the result; nothing is cached or logged. We also only fetch public websites — private and internal addresses are refused.",
      },
    ],
  },
];

export function getTool(slug: string): ToolMeta | null {
  return TOOLS.find((t) => t.slug === slug) ?? null;
}

/** Live (routable) tools — Phase 1. */
export function liveTools(): ToolMeta[] {
  return TOOLS.filter((t) => t.phase === 1);
}

/** Coming-soon tools — Phase 2 (grid cards only, no route). */
export function comingSoonTools(): ToolMeta[] {
  return TOOLS.filter((t) => t.phase === 2);
}
