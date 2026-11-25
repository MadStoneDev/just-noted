// @vitest-environment jsdom
//
// Wide view toggle: both "on" states (this note, all notes) show the aqua
// active style; only "off" is plain. Regression: the active accent colour was
// appended next to the base ink colour, and the base won by stylesheet order.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach } from "vitest";
import NoteActionBar, { barButtonClass } from "./note-action-bar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderWide(isWide: boolean, label?: string, isShared = false): HTMLButtonElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <NoteActionBar isShared={isShared} onHelp={() => {}} wide={{ isWide, tooltip: "Wide", onCycle: () => {}, label }} />,
    ),
  );
  return host.querySelector('[data-testid="wide-toggle"]') as HTMLButtonElement;
}

const ACTIVE = "text-[var(--color-accent)]";
const PLAIN = "text-[var(--color-ink-5)]";

describe("wide view toggle", () => {
  it("off is plain", () => {
    const b = renderWide(false);
    expect(b.className).toContain(PLAIN);
    expect(b.className).not.toContain(ACTIVE);
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });

  it("this note is aqua, with no competing ink colour", () => {
    const b = renderWide(true);
    expect(b.className).toContain(ACTIVE);
    expect(b.className).not.toContain(PLAIN);
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });

  it("all notes is aqua, with no competing ink colour", () => {
    const b = renderWide(true, "All");
    expect(b.className).toContain(ACTIVE);
    expect(b.className).not.toContain(PLAIN);
    expect(b.textContent).toContain("All");
  });

  it("shared notes use the same active style", () => {
    const b = renderWide(true, undefined, true);
    expect(b.className).toContain(ACTIVE);
    expect(b.className).not.toContain("text-[var(--color-accent-text)]");
  });

  it("barButtonClass never emits two text colours", () => {
    for (const shared of [false, true]) {
      for (const active of [false, true]) {
        const colours = barButtonClass(shared, active).split(" ").filter((c) => c.startsWith("text-["));
        expect(colours).toHaveLength(1);
      }
    }
  });
});
