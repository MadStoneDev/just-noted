import { Metadata } from "next";
import PricingView from "@/components/pricing-view";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /pricing). PricingView is a client component, so its static content (plan
// names, prices, FAQ) is in the first HTML response for SEO; billing state
// hydrates on top.
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
  return <PricingView />;
}
