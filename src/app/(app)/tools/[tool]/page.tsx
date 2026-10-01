import { Metadata } from "next";
import { getTool, TOOLS } from "@/lib/text-tools/registry";

// Per-tool SEO: own title / description / canonical / OG, derived from the
// registry. NoteWrapper reads the :tool slug from the URL and renders the tool.
export async function generateMetadata(
  { params }: { params: Promise<{ tool: string }> },
): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool) {
    return { title: "Tool — JustNoted" };
  }
  const title = `${tool.name} — JustNoted`;
  const url = `/tools/${tool.slug}`;
  return {
    title,
    description: tool.tagline,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: tool.tagline,
      url,
      type: "website",
      siteName: "JustNoted",
      images: [{ url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: tool.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool.tagline,
      images: ["/JustNoted_OG.jpg"],
    },
  };
}

// Pre-render a path for each known tool (nicer SEO + static where possible).
export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export default function ToolPage() {
  return null;
}
