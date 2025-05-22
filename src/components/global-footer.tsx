import Link from "next/link";
import React from "react";

export default function GlobalFooter() {
  // check this year
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`p-4 sm:px-8 text-xs text-neutral-400 print:hidden`}>
      Copyright © 2025{currentYear > 2025 ? "-" + currentYear : ""}{" "}
      <Link
        href={`/`}
        className={`hover:text-mercedes-primary font-semibold transition-all duration-300 ease-in-out`}
      >
        Just Noted
      </Link>
      .{" "}
      <Link
        href={`/privacy-policy`}
        className={`hover:text-mercedes-primary transition-all duration-300 ease-in-out`}
      >
        Privacy Policy
      </Link>
    </footer>
  );
}
