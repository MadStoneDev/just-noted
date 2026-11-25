// @vitest-environment jsdom
//
// The version history panel closes on Escape and on a click outside it, and a
// click inside it doesn't close it.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { resetEscapeStack } from "@/utils/escape-stack";

vi.mock("@/app/actions/versionActions", () => ({
  getVersions: vi.fn(async () => ({ success: true, versions: [], canFilter: false })),
}));

import VersionHistoryPanel from "./version-history-panel";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetEscapeStack();
});

async function mount(onClose: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<VersionHistoryPanel noteId="n1" open onClose={onClose} onRestore={() => {}} />);
  });
}

describe("VersionHistoryPanel", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn();
    await mount(onClose);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a click outside the panel", async () => {
    const onClose = vi.fn();
    await mount(onClose);
    act(() => (host!.querySelector('[data-testid="version-history-backdrop"]') as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open on a click inside the panel", async () => {
    const onClose = vi.fn();
    await mount(onClose);
    act(() => (host!.querySelector("h3") as HTMLElement).click());
    expect(onClose).not.toHaveBeenCalled();
  });
});
