"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  IconSearch,
  IconChevronRight,
  IconArrowLeft,
  IconPlus,
} from "@tabler/icons-react";

export interface CommandItem {
  id: string;
  label: string;
  /** Muted prefix rendered before the label, e.g. a parent notebook name. */
  prefix?: string;
  description?: string;
  icon?: React.ReactNode;
  /** Right-aligned hint (a shortcut, a small label). */
  hint?: string;
  /** Extra text matched by the filter but not shown. */
  keywords?: string;
  destructive?: boolean;
  /** Renders the row in the accent colour (e.g. an inline "create" action). */
  accent?: boolean;
  disabled?: boolean;
  /** Right-aligned node (e.g. a check for the current selection). */
  trailing?: React.ReactNode;
  /** Runs when the item is chosen. */
  perform?: () => void | Promise<void>;
  /** If set, choosing the item drills into this sub-page instead of performing. */
  submenu?: CommandPage;
  /** Keep the palette open after performing (default false — it closes). */
  keepOpen?: boolean;
}

export interface CommandGroup {
  id: string;
  heading?: string;
  items: CommandItem[];
}

export interface CommandPage {
  title: string;
  placeholder?: string;
  groups: CommandGroup[];
  /**
   * When set, a "Create …" row appears at the bottom while the user is typing
   * (and nothing matches the query exactly), calling this with the typed text.
   */
  onCreate?: (query: string) => void;
  /** Label for the create row; defaults to `Create “{query}”`. */
  createLabel?: (query: string) => string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** The root page shown when the palette opens. */
  page: CommandPage;
}

/**
 * A centered command palette (Superhuman/Linear style): search input, grouped
 * command rows, full keyboard control, and drill-in sub-pages (an item with a
 * `submenu` pushes a new page — e.g. "Move to notebook" opens the notebook list).
 */
export function CommandPalette({ open, onClose, page }: CommandPaletteProps) {
  const [stack, setStack] = useState<CommandPage[]>([page]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const current = stack[stack.length - 1];

  // Reset to the root page whenever the palette opens.
  useEffect(() => {
    if (open) {
      setStack([page]);
      setQuery("");
      setActiveIndex(0);
    }
    // Intentionally only keyed on `open` — we snapshot `page` at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Filter the current page's groups by the query, dropping empty groups.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return current.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!q) return true;
          const hay = `${item.prefix ?? ""} ${item.label} ${item.description ?? ""} ${item.keywords ?? ""}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [current, query]);

  // Optional inline "Create …" row: shown while typing when the page opts in and
  // no item matches the query exactly.
  const createItem = useMemo<CommandItem | null>(() => {
    const q = query.trim();
    if (!current.onCreate || !q) return null;
    const exists = current.groups.some((g) =>
      g.items.some((it) => it.label.toLowerCase() === q.toLowerCase()),
    );
    if (exists) return null;
    return {
      id: "__create__",
      label: current.createLabel ? current.createLabel(q) : `Create “${q}”`,
      icon: <IconPlus size={16} />,
      accent: true,
      perform: () => current.onCreate?.(q),
    };
  }, [current, query]);

  const groupsToRender = useMemo(
    () =>
      createItem
        ? [...filteredGroups, { id: "__create__group", items: [createItem] }]
        : filteredGroups,
    [filteredGroups, createItem],
  );

  // Flatten to a single navigable list of selectable (non-disabled) items.
  const flatItems = useMemo(
    () => groupsToRender.flatMap((g) => g.items),
    [groupsToRender],
  );

  // Keep the active index in range as the list changes.
  useEffect(() => {
    setActiveIndex((i) => {
      const max = flatItems.length - 1;
      if (max < 0) return 0;
      return Math.min(i, max);
    });
  }, [flatItems.length]);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setQuery("");
    setActiveIndex(0);
  }, []);

  const select = useCallback(
    (item: CommandItem | undefined) => {
      if (!item || item.disabled) return;
      if (item.submenu) {
        setStack((s) => [...s, item.submenu as CommandPage]);
        setQuery("");
        setActiveIndex(0);
        return;
      }
      // Fire-and-forget: async performs (e.g. move-to-notebook) run their own
      // optimistic update, so the palette can close immediately.
      item.perform?.();
      if (!item.keepOpen) onClose();
    },
    [onClose],
  );

  // Focus management + scroll lock while open.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Keep the highlighted row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (flatItems.length ? (i + 1) % flatItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(flatItems[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (stack.length > 1) goBack();
      else onClose();
    } else if (e.key === "Backspace" && query === "" && stack.length > 1) {
      e.preventDefault();
      goBack();
    }
  };

  if (!open) return null;

  let flatCursor = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div
        className="absolute inset-0 bg-[var(--color-bg-overlay)] animate-fade-in"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-lg flex flex-col max-h-[70vh] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-primary)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] animate-scale-in"
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--color-border-secondary)]">
          {stack.length > 1 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <IconArrowLeft size={16} />
            </button>
          ) : (
            <IconSearch
              size={16}
              className="flex-none text-[var(--color-text-tertiary)]"
            />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={current.placeholder ?? "Type a command…"}
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {stack.length > 1 && (
            <span className="flex-none text-[11px] text-[var(--color-text-tertiary)] truncate max-w-[40%]">
              {current.title}
            </span>
          )}
        </div>

        {/* Command list */}
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin py-1.5">
          {flatItems.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
              No matches
            </div>
          )}

          {groupsToRender.map((group) => (
            <div key={group.id} className="px-1.5 pb-1">
              {group.heading && (
                <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {group.heading}
                </div>
              )}
              {group.items.map((item) => {
                flatCursor += 1;
                const index = flatCursor;
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-cmd-index={index}
                    disabled={item.disabled}
                    onClick={() => select(item)}
                    onMouseMove={() => setActiveIndex(index)}
                    aria-current={active || undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-left transition-colors ${
                      item.disabled
                        ? "opacity-40 cursor-not-allowed"
                        : active
                          ? item.destructive
                            ? "bg-[var(--color-danger-subtle)]"
                            : "bg-[var(--color-selected)]"
                          : ""
                    }`}
                  >
                    {item.icon && (
                      <span
                        className={`flex-none grid place-items-center [&_svg]:size-4 ${
                          item.destructive
                            ? "text-[var(--color-danger)]"
                            : item.accent
                              ? "text-[var(--color-accent)]"
                              : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span
                        className={`text-sm truncate ${
                          item.destructive
                            ? "text-[var(--color-danger)]"
                            : item.accent
                              ? "text-[var(--color-accent)] font-medium"
                              : "text-[var(--color-text-primary)]"
                        }`}
                      >
                        {item.prefix && (
                          <span className="text-[var(--color-text-tertiary)]">
                            {item.prefix} /{" "}
                          </span>
                        )}
                        {item.label}
                      </span>
                      {item.description && (
                        <span className="text-xs text-[var(--color-text-tertiary)] truncate">
                          {item.description}
                        </span>
                      )}
                    </span>
                    {item.trailing}
                    {!item.trailing && item.hint && (
                      <span className="flex-none text-[11px] text-[var(--color-text-tertiary)]">
                        {item.hint}
                      </span>
                    )}
                    {!item.trailing && !item.hint && item.submenu && (
                      <IconChevronRight
                        size={15}
                        className="flex-none text-[var(--color-text-tertiary)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-border-secondary)] text-[11px] text-[var(--color-text-tertiary)]">
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono border border-[var(--color-border-primary)] rounded px-1">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono border border-[var(--color-border-primary)] rounded px-1">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono border border-[var(--color-border-primary)] rounded px-1">esc</kbd>
            {stack.length > 1 ? "back" : "close"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
