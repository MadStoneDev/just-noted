import { Metadata } from "next";
import ToolsGrid from "@/components/tools/tools-grid";

const DESCRIPTION =
  "Small, free utilities for anyone who writes for the web. You don't need an account, and your text stays on your device.";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /tools) so the grid is in the first HTML response for search.
export const metadata: Metadata = {
  title: "Free Online Writing Tools | JustNoted",
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "Free Online Writing Tools | JustNoted",
    description: DESCRIPTION,
    url: "/tools",
    type: "website",
    siteName: "JustNoted",
    images: [{ url: "/og/justnoted.png", width: 1200, height: 630, alt: "JustNoted — free online writing tools" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Online Writing Tools | JustNoted",
    description: DESCRIPTION,
    images: ["/og/justnoted.png"],
  },
};

export default function ToolsPage() {
  return <ToolsGrid />;
}
