import { Metadata } from "next";

// Rendered by NoteWrapper (in the (app) layout) via the URL — the pricing page
// opens inside the app shell (rail + content), like Roadmap. Marker page.
export const metadata: Metadata = {
  title: "Plans & Pricing — JustNoted",
  description:
    "JustNoted is free for note-taking. Upgrade to Scribe (A$5/month, no GST) for live collaboration, unlimited notebooks, longer trash recovery and more version history.",
  openGraph: {
    title: "Plans & Pricing — JustNoted",
    description:
      "Free for note-taking. Scribe is A$5/month (no GST) for live collaboration and more.",
    images: [{ url: "/JustNoted_OG.jpg", width: 1200, height: 630, alt: "JustNoted plans" }],
    type: "website",
    siteName: "JustNoted",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plans & Pricing — JustNoted",
    description: "Free for note-taking. Scribe is A$5/month (no GST).",
    images: ["/JustNoted_OG.jpg"],
  },
};

export default function PricingPage() {
  return null;
}
