import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTool, liveTools } from "@/lib/text-tools/registry";
import ToolView from "@/components/tools/tool-view";

// Per-tool SEO: own title / description / canonical / OG, from the registry.
// Phase-2 ("coming soon") tools have no route yet — they 404.
export async function generateMetadata(
  { params }: { params: Promise<{ tool: string }> },
): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool || tool.phase !== 1) {
    return { title: "Tool not found | JustNoted" };
  }
  const url = `/tools/${tool.slug}`;
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: url },
    openGraph: {
      title: tool.title,
      description: tool.description,
      url,
      type: "website",
      siteName: "JustNoted",
      images: [{ url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: tool.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: tool.title,
      description: tool.description,
      images: ["/JustNoted_OG.jpg"],
    },
  };
}

// Only live (Phase 1) tools get a prerendered route.
export function generateStaticParams() {
  return liveTools().map((t) => ({ tool: t.slug }));
}

export default async function ToolPage(
  { params }: { params: Promise<{ tool: string }> },
) {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool || tool.phase !== 1) notFound();
  return <ToolView slug={slug} />;
}
