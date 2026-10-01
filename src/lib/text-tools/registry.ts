// Tool catalogue — pure data, imported by the grid, the per-tool views, and the
// server-side metadata (title / description / OG / canonical). Add a tool here
// and wire its component in tool-view.tsx.

export interface ToolMeta {
  slug: string;
  name: string;
  /** One line for the card and the meta/OG description. */
  tagline: string;
  /** How-it-works bullets shown under the tool. */
  howItWorks: string[];
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "slug-generator",
    name: "Slug Generator",
    tagline: "Turn titles into clean, readable URL slugs — right in your browser.",
    howItWorks: [
      "Type or paste a title and the slug updates live underneath.",
      "It lowercases, strips accents, turns “&” into “and”, drops apostrophes, and replaces anything else with hyphens.",
      "Optionally remove filler words (a, an, the, of, and, …) or cap the length at a word boundary.",
      "Batch mode turns one title per line into one slug per line.",
    ],
  },
  {
    slug: "case-converter",
    name: "Case Converter",
    tagline: "Change text case and tidy it up — UPPER, Title, camelCase and more.",
    howItWorks: [
      "Paste text, pick a transformation, and it changes in place.",
      "Case options: UPPER, lower, Sentence, Title, Capitalise Every Word, camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE.",
      "Cleanup options: trim, collapse spaces, remove line breaks/empty/duplicate lines, sort, straight/curly quotes, strip HTML or Markdown.",
      "Undo steps back; Copy puts the result on your clipboard.",
    ],
  },
];

export function getTool(slug: string): ToolMeta | null {
  return TOOLS.find((t) => t.slug === slug) ?? null;
}
