// @vitest-environment jsdom
//
// Escape closes the topmost open popover, modal or drawer only, and never
// reaches the global shortcut listener (which used to collapse the sidebar).

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { pushEscapeLayer, resetEscapeStack, useEscapeLayer, hasEscapeLayer } from "./escape-stack";

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
});
