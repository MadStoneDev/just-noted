import "./globals.css";

import { GoogleAnalytics } from "@next/third-parties/google";
import { Outfit, Playfair_Display } from "next/font/google";

import React, { ReactNode } from "react";
import Link from "next/link";
import GlobalHeader from "@/components/global-header";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`bg-neutral-200  min-h-dvh flex flex-col ${outfit.variable} ${playfair.variable} antialiased`}
      >
        <GlobalHeader />

        <main className={`mt-20 flex-grow px-4 sm:px-8 w-full overflow-hidden`}>
          {children}
        </main>

        <footer className={`p-4 sm:px-8 text-xs text-neutral-400`}>
          Copyright © 2025{" "}
          <Link
            href={`/`}
            className={`hover:text-mercedes-primary transition-all duration-300 ease-in-out`}
          >
            Just Noted
          </Link>
        </footer>
      </body>

      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || ""} />
    </html>
  );
}
