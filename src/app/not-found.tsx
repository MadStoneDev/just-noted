import React from "react";
import Link from "next/link";
import { IconHome, IconSearch } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="mb-8">
          <h1 className="text-7xl font-bold text-[var(--color-border-primary)] font-brand">
            404
          </h1>
        </div>

        <div className="flex justify-center mb-5">
          <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-full">
            <IconSearch size={32} className="text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Page Not Found
        </h2>

        <p className="text-sm text-[var(--color-text-secondary)] mb-8 leading-relaxed">
          This page doesn't exist. It may have been moved or deleted.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-[var(--duration-fast)]"
        >
          <IconHome size={16} strokeWidth={1.5} />
          Back to Home
        </Link>

        <p className="text-xs text-[var(--color-text-tertiary)] mt-6">
          Your notes are safe and waiting for you
        </p>
      </div>
    </div>
  );
}
