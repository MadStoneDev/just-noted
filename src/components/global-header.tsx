"use client";

import Link from "next/link";
import React, { useState, useCallback } from "react";

import { User } from "@supabase/supabase-js";
import {
  IconMenu2,
  IconX,
  IconUser,
  IconKey,
  IconLayoutSidebarLeftCollapse,
  IconSearch,
  IconPlus,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ds/theme-toggle";

interface GlobalHeaderProps {
  user: User | null;
  appMode?: boolean;
  onToggleSidebar?: () => void;
  onSearch?: () => void;
  onNewNote?: () => void;
}

export default function GlobalHeader({
  user,
  appMode = false,
  onToggleSidebar,
  onSearch,
  onNewNote,
}: GlobalHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navLinks = [
    { href: "/welcome", label: "About" },
    { href: "/the-how", label: "How it Works" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="fixed w-full z-50 print:hidden">
      <nav className="px-4 md:px-6 flex items-center justify-between w-full h-14 bg-[var(--color-bg-primary)]/80 backdrop-blur-xl border-b border-[var(--color-border-secondary)]">
        {/* Left side */}
        <div className="flex items-center gap-2">
          {appMode && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
              aria-label="Toggle notes"
            >
              <IconLayoutSidebarLeftCollapse size={18} className="rotate-180" />
            </button>
          )}
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]"
          >
            <span className="text-[var(--color-accent)]">Just</span>
            <span className="font-brand">Noted</span>
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {/* App-mode buttons */}
          {appMode && (
            <>
              {onSearch && (
                <button
                  onClick={onSearch}
                  className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-tertiary)] md:hidden"
                  aria-label="Search"
                >
                  <IconSearch size={16} />
                </button>
              )}
              {onNewNote && (
                <button
                  onClick={onNewNote}
                  className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-tertiary)] md:hidden"
                  aria-label="New note"
                >
                  <IconPlus size={16} />
                </button>
              )}
            </>
          )}

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
          <button
            className="md:hidden p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-[var(--color-bg-overlay)] md:hidden"
            style={{ top: 56 }}
            onClick={closeMenu}
          />
          <div className="fixed top-14 right-0 w-[min(280px,calc(100vw-48px))] h-[calc(100dvh-56px)] bg-[var(--color-bg-primary)] border-l border-[var(--color-border-secondary)] shadow-xl md:hidden flex flex-col z-50 animate-slide-in-right">
            <nav className="flex-1 p-3 space-y-1">
              <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors">
                Home
              </Link>
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={closeMenu} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors">
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-[var(--color-border-secondary)] my-2" />
              {user ? (
                <Link href="/profile" onClick={closeMenu} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors">
                  <IconUser size={16} /> Profile
                </Link>
              ) : (
                <Link href="/get-access" onClick={closeMenu} className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] transition-colors">
                  <IconKey size={16} /> Get Access
                </Link>
              )}
            </nav>
            <div className="p-4 border-t border-[var(--color-border-secondary)]">
              <ThemeToggle />
            </div>
          </div>
        </>
      )}
    </header>
  );
}
