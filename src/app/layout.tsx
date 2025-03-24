import "./globals.css";
import { Outfit, Playfair_Display } from "next/font/google";

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
        className={`bg-neutral-200 ${outfit.variable} ${playfair.variable} antialiased`}
      >
        <header
          className={`mb-4 px-4 sm:px-8 py-4 w-full bg-mercedes-primary font-secondary`}
        >
          <p className={`text-xl`}>
            Just
            <span className={`text-neutral-50 font-medium`}>Noted</span>
          </p>
        </header>
        {children}
      </body>
    </html>
  );
}
