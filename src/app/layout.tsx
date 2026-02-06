import "./globals.css";

import { GoogleAnalytics } from "@next/third-parties/google";
import { Outfit, Playfair_Display } from "next/font/google";

import React, { ReactNode } from "react";
import LogRocket from "@/components/providers/logrocket-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ConsentBanner } from "@/components/ui/consent-banner";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata = {
  title: "Just Noted - Distraction-Free Note Taking",
  description:
    "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
  openGraph: {
    title: "Just Noted - Distraction-Free Note Taking",
    description:
      "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
    images: [
      {
        url: "/JustNoted_OG.jpg",
        width: 1200,
        height: 630,
        alt: "Just Noted - Distraction-Free Note Taking",
      },
    ],
    locale: "en_US",
    type: "website",
    siteName: "Just Noted",
  },
  twitter: {
    card: "summary_large_image",
    title: "Just Noted - Distraction-Free Note Taking",
    description:
      "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
    images: ["/JustNoted_OG.jpg"],
    creator: "@justnoted",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`bg-neutral-200 min-h-dvh print:min-h-0 flex flex-col ${outfit.variable} ${playfair.variable} antialiased`}
      >
        <LogRocket>
          <ToastProvider>
            <div className={`h-16 print:hidden`}></div>

            {children}

            <ConsentBanner />
          </ToastProvider>
        </LogRocket>
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || ""} />
    </html>
  );
}
