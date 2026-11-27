// @vitest-environment jsdom
//
// Escape closes the topmost open popover, modal or drawer only, and never
// reaches the global shortcut listener (which used to collapse the sidebar).

import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { pushEscapeLayer, resetEscapeStack, useEscapeLayer, hasEscapeLayer, useDismissableLayer } from "./escape-stack";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

afterEach(() => resetEscapeStack());

describe("escape stack", () => {
  it("closes only the most recently opened layer, one per press", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = pushEscapeLayer(a);
    const offB = pushEscapeLayer(b);
    press();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    offB();
    press();
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    expect(hasEscapeLayer()).toBe(false);
  });

  it("stops the event before any other keydown listener when a layer is open", () => {
    const global = vi.fn();
    window.addEventListener("keydown", global);
    const off = pushEscapeLayer(() => {});
    press();
    expect(global).not.toHaveBeenCalled();
    off();
    press(); // nothing open: the event passes through
    expect(global).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", global);
  });

  it("ignores other keys", () => {
    const close = vi.fn();
    const off = pushEscapeLayer(close);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(close).not.toHaveBeenCalled();
    off();
  });

  it("a parent re-rendering keeps its place under a child opened later", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    const closed: string[] = [];
    let rerenderParent!: () => void;

    function Child() {
      useEscapeLayer(true, () => closed.push("child"));
      return null;
    }
    function Parent() {
      const [n, setN] = useState(0);
      const [child, setChild] = useState(false);
      rerenderParent = () => setN((x) => x + 1);
      // A fresh onClose every render (the common inline-arrow case).
      useEscapeLayer(true, () => closed.push(`parent${n}`));
      return (
        <>
          <button onClick={() => setChild(true)}>open</button>
          {child && <Child />}
        </>
      );
    }

    act(() => root.render(<Parent />));
    act(() => host.querySelector("button")!.click());
    act(() => rerenderParent());
    act(() => press());
    expect(closed).toEqual(["child"]);
    act(() => root.unmount());
    host.remove();
  });

  it("an outside press closes only the topmost layer, and only if it has an outside test", () => {
    const panel = document.createElement("div");
    const inner = document.createElement("button");
    panel.appendChild(inner);
    document.body.appendChild(panel);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const down = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    const parent = vi.fn();
    const offParent = pushEscapeLayer(parent, (t) => !panel.contains(t));
    down(inner);
    expect(parent).not.toHaveBeenCalled(); // inside: stays open
    down(outside);
    expect(parent).toHaveBeenCalledTimes(1);

    // A child without an outside test (e.g. a floating-ui dropdown) is topmost:
    // the press is the child's to handle, the parent under it stays open.
    const child = vi.fn();
    const offChild = pushEscapeLayer(child);
    down(outside);
    expect(parent).toHaveBeenCalledTimes(1);
    expect(child).not.toHaveBeenCalled();
    offChild();
    offParent();
    panel.remove();
    outside.remove();
  });

  it("useDismissableLayer: Esc, outside press, trigger toggles, focus returns to the opener", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const away = document.createElement("button");
    away.textContent = "away";
    document.body.appendChild(away);
    const root: Root = createRoot(host);
    const down = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    function Menu() {
      const [open, setOpen] = useState(false);
      const wrap = useRef<HTMLDivElement>(null);
      useDismissableLayer({ open, onClose: () => setOpen(false), inside: [wrap] });
      return (
        <div ref={wrap}>
          <button data-t="trigger" onClick={() => setOpen((o) => !o)}>menu</button>
          {open && <button data-t="item">item</button>}
        </div>
      );
    }

    act(() => root.render(<Menu />));
    const trigger = host.querySelector<HTMLButtonElement>('[data-t="trigger"]')!;
    const item = () => host.querySelector<HTMLButtonElement>('[data-t="item"]');

    // Open, move focus into the menu, Escape: closed, focus back on the trigger.
    trigger.focus();
    act(() => trigger.click());
    act(() => item()!.focus());
    act(() => press());
    expect(item()).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Inside press keeps it open; outside press closes it.
    act(() => trigger.click());
    act(() => down(item()!));
    expect(item()).not.toBeNull();
    act(() => down(away));
    expect(item()).toBeNull();

    // Pressing the trigger while open is "inside": its click toggles it shut
    // once, rather than close-on-pointerdown then reopen-on-click.
    act(() => trigger.click());
    act(() => {
      down(trigger);
      trigger.click();
    });
    expect(item()).toBeNull();
    expect(hasEscapeLayer()).toBe(false);

    act(() => root.unmount());
    host.remove();
    away.remove();
  });

  it("useDismissableLayer: focus that moved elsewhere is not pulled back", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const other = document.createElement("input");
    document.body.appendChild(other);
    const root: Root = createRoot(host);
    let setOpen!: (v: boolean) => void;

    function Panel() {
      const [open, _set] = useState(false);
      setOpen = _set;
      const ref = useRef<HTMLDivElement>(null);
      useDismissableLayer({ open, onClose: () => _set(false), inside: [ref] });
      return <div ref={ref}><button data-t="opener">open</button></div>;
    }

    act(() => root.render(<Panel />));
    host.querySelector<HTMLButtonElement>('[data-t="opener"]')!.focus();
    act(() => setOpen(true));
    other.focus(); // user clicked into another field
    act(() => setOpen(false));
    expect(document.activeElement).toBe(other);

    act(() => root.unmount());
    host.remove();
    other.remove();
  });
});
