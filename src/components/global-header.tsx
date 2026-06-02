"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";

import { User } from "@supabase/supabase-js";
import {
  IconMenu2,
  IconX,
  IconUser,
  IconKey,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ds/theme-toggle";
import { IconButton } from "@/components/ds/icon-button";

interface GlobalHeaderProps {
  user: User | null;
}

export default function GlobalHeader({ user }: GlobalHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navLinks = [
    { href: "/the-what", label: "About" },
    { href: "/the-how", label: "How it Works" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="hidden md:block fixed w-full z-50 print:hidden">
      <nav
        className="px-4 md:px-6 flex items-center justify-between w-full h-14 bg-[var(--color-bg-primary)]/80 backdrop-blur-xl border-b border-[var(--color-border-secondary)]"
      >
        {/* Logo */}
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]"
        >
          <span className="text-[var(--color-accent)]">Just</span>
          <span className="font-brand">Noted</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)]"
            >
              {link.label}
            </Link>
          ))}

          <div className="w-px h-4 bg-[var(--color-border-primary)] mx-1" />

          <ThemeToggle />

          <div className="w-px h-4 bg-[var(--color-border-primary)] mx-1" />

          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)]"
            >
              <IconUser size={16} />
              Profile
            </Link>
          ) : (
            <Link
              href="/get-access"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)]"
            >
              <IconKey size={16} />
              Get Access
            </Link>
          )}
        </div>

        {/* Mobile menu button */}
        <IconButton
          label={menuOpen ? "Close menu" : "Open menu"}
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <IconX size={20} /> : <IconMenu2 size={20} />}
        </IconButton>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-[var(--color-bg-overlay)] md:hidden animate-fade-in"
            onClick={closeMenu}
          />
          <div className="fixed top-14 left-0 right-0 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] shadow-[var(--shadow-lg)] md:hidden animate-slide-down z-50">
            <div className="p-4 flex flex-col gap-1">
              <Link
                href="/"
                onClick={closeMenu}
                className="px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors"
              >
                Home
              </Link>

              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors"
                >
                  {link.label}
                </Link>
              ))}

              <div className="h-px bg-[var(--color-border-secondary)] my-2" />

              <div className="px-3 py-2">
                <ThemeToggle />
              </div>

              <div className="h-px bg-[var(--color-border-secondary)] my-2" />

              {user ? (
                <Link
                  href="/profile"
                  onClick={closeMenu}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors"
                >
                  <IconUser size={18} />
                  Profile
                </Link>
              ) : (
                <Link
                  href="/get-access"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] transition-colors"
                >
                  <IconKey size={18} />
                  Get Access
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
