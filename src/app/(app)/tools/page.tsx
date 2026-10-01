import { Metadata } from "next";

// Rendered by NoteWrapper (in the (app) layout) via the URL — the tools grid
// opens inside the app shell (rail + content), like Roadmap/Pricing. Marker page.
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
  return null;
}
