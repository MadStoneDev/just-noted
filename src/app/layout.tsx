import "./globals.css";

import { GoogleAnalytics } from "@next/third-parties/google";
import { Inter, Playfair_Display, Newsreader, Public_Sans } from "next/font/google";

import React, { ReactNode } from "react";
import LogRocket from "@/components/providers/logrocket-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ConsentBanner } from "@/components/ui/consent-banner";
import PreventFileDropNavigation from "@/components/providers/prevent-file-drop";
import UpdateAvailableBanner from "@/components/update-available-banner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Redesign typefaces (handoff): Newsreader for editor/headings, Public Sans for UI chrome.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  // Resolves relative OG/Twitter image URLs against the real site instead of
  // localhost:3000 (the Next default when unset), so shared links show the card.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://justnoted.app"),
  title: "Distraction-Free Note Taking App | JustNoted",
  description:
    "A calm, distraction-free place to write and keep your notes. Works offline, syncs across your devices, and lets you share and collaborate. Free to start.",
  openGraph: {
    url: "/",
    title: "Distraction-Free Note Taking App | JustNoted",
    description:
      "A calm, distraction-free place to write and keep your notes. Works offline, syncs across your devices, and lets you share and collaborate. Free to start.",
    images: [
      {
        url: "/JustNoted_OG.jpg",
        width: 1200,
        height: 630,
        alt: "JustNoted — distraction-free note taking",
      },
    ],
    locale: "en_US",
    type: "website",
    siteName: "JustNoted",
  },
  twitter: {
    card: "summary_large_image",
    title: "Distraction-Free Note Taking App | JustNoted",
    description:
      "A calm, distraction-free place to write and keep your notes. Works offline, syncs across your devices, and lets you share and collaborate. Free to start.",
    images: ["/JustNoted_OG.jpg"],
    creator: "@justnoted",
  },
};

// viewport-fit=cover so env(safe-area-inset-*) works on notched devices
// (used by the mobile new-note FAB and other fixed bottom UI).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${newsreader.variable} ${publicSans.variable}`}
    >
      <body
        className={`min-h-dvh print:min-h-0 flex flex-col ${inter.variable} ${playfair.variable} ${newsreader.variable} ${publicSans.variable} antialiased`}
        style={{ backgroundColor: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
      >
        <LogRocket>
          <ToastProvider>
            <PreventFileDropNavigation />

            {children}

            <UpdateAvailableBanner />
            <ConsentBanner />
          </ToastProvider>
        </LogRocket>
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || ""} />
    </html>
  );
}
