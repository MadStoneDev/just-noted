import { Metadata } from "next";
import ToolsGrid from "@/components/tools/tools-grid";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /tools) so the grid is in the first HTML response for search.
export const metadata: Metadata = {
  title: "Free Text Tools — JustNoted",
  description:
    "Small, fast text tools that run entirely in your browser — your text never leaves your device. Slug generator, case converter and more.",
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "Free Text Tools — JustNoted",
    description:
      "Small, fast text tools that run entirely in your browser — your text never leaves your device.",
    url: "/tools",
    type: "website",
    siteName: "JustNoted",
    images: [{ url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: "JustNoted tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Text Tools — JustNoted",
    description: "Small, fast text tools that run entirely in your browser.",
    images: ["/JustNoted_OG.jpg"],
  },
};

export default function ToolsPage() {
  return <ToolsGrid />;
}
