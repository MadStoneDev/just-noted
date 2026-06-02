"use client";

import React, { useEffect, useState } from "react";
import { IconSun, IconMoon, IconDeviceDesktop } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "justnoted_theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const resolved = getSystemTheme();
    if (resolved === "dark") root.classList.add("dark");
  } else {
    root.classList.add(theme);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored || "system";
    setThemeState(initial);
    applyTheme(initial);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const current = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (!current || current === "system") applyTheme("system");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  };

  return { theme, setTheme };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <IconSun size={14} />, label: "Light" },
    { value: "dark", icon: <IconMoon size={14} />, label: "Dark" },
    { value: "system", icon: <IconDeviceDesktop size={14} />, label: "System" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)]",
        className,
      )}
      role="radiogroup"
      aria-label="Theme"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-md)] transition-all duration-[var(--duration-fast)] cursor-pointer",
            theme === opt.value
              ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-xs"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]",
          )}
          role="radio"
          aria-checked={theme === opt.value}
          aria-label={opt.label}
        >
          {opt.icon}
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
