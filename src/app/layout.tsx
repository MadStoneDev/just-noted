import "./globals.css";
import { Outfit, Playfair_Display } from "next/font/google";

import React from "react";
import Link from "next/link";

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
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`bg-neutral-200  min-h-screen flex flex-col ${outfit.variable} ${playfair.variable} antialiased`}
      >
        <header
          className={`mb-4 px-4 sm:px-8 py-4 w-full bg-mercedes-primary font-secondary z-50`}
        >
          <Link href={`/`} className={`text-xl font-semibold`}>
            Just
            <span className={`text-white`}>Noted</span>
          </Link>
        </header>

        <main className={`flex-grow px-4 sm:px-8 w-full overflow-hidden`}>
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
    </html>
  );
}
