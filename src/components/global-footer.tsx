import Link from "next/link";
import React from "react";

export default function GlobalFooter() {
  // check this year
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`p-4 sm:px-8 text-xs text-[var(--color-text-tertiary)] print:hidden`}>
      Copyright © 2025{currentYear > 2025 ? "-" + currentYear : ""}{" "}
      <Link
        href={`/`}
        className={`hover:text-[var(--color-accent)] font-semibold transition-all duration-300 ease-in-out`}
      >
        Just Noted
      </Link>
      .{" "}
      <Link
        href={`/privacy-policy`}
        className={`hover:text-[var(--color-accent)] transition-all duration-300 ease-in-out`}
      >
        Privacy Policy
      </Link>
    </footer>
  );
}
