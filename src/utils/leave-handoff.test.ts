import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  __receiveForTest,
  __resetLeaveHandoffForTest,
  hasNoteHandoffListener,
  isLeaveHandoff,
  peekHandoff,
  settleHandoff,
  subscribeLeaveHandoffs,
  subscribeNoteHandoffs,
  type LeaveHandoff,
} from "./leave-handoff";
import { TAB_ID } from "./cross-tab";

const msg = (over: Partial<LeaveHandoff> = {}): LeaveHandoff => ({
  noteId: "n1",
  source: "redis",
  userId: "00000000-0000-4000-8000-000000000001",
  content: "typed before close",
  goal: 0,
  goalType: "",
  baseVersion: 2,
  copyId: "00000000-0000-4000-8000-0000000000c1",
  from: "other-tab",
  ...over,
});

beforeEach(() => __resetLeaveHandoffForTest());

describe("leave handoff — receiving side", () => {
  it("validates the message shape", () => {
    expect(isLeaveHandoff(msg())).toBe(true);
    expect(isLeaveHandoff({ ...msg(), source: "other" })).toBe(false);
    expect(isLeaveHandoff({ ...msg(), content: 1 })).toBe(false);
    expect(isLeaveHandoff({ ...msg(), baseVersion: 1.5 })).toBe(false);
    expect(isLeaveHandoff({ ...msg(), copyId: "" })).toBe(false);
    expect(isLeaveHandoff(null)).toBe(false);
  });

  it("remembers the newest per note until settled", () => {
    __receiveForTest(msg());
    __receiveForTest(msg({ content: "newer", copyId: "c2" }));
    expect(peekHandoff("n1")?.content).toBe("newer");
    settleHandoff("n1", "old-copy-id"); // not the newest: kept
    expect(peekHandoff("n1")?.content).toBe("newer");
    settleHandoff("n1", "c2");
    expect(peekHandoff("n1")).toBeUndefined();
  });

  it("ignores its own tab's messages and malformed ones", () => {
    const all = vi.fn();
    subscribeLeaveHandoffs(all);
    __receiveForTest(msg({ from: TAB_ID }));
    __receiveForTest({ noteId: "n1" });
    expect(all).not.toHaveBeenCalled();
    expect(peekHandoff("n1")).toBeUndefined();
  });

  it("notifies the app-wide receiver, then the note's editor", () => {
    const order: string[] = [];
    subscribeLeaveHandoffs(() => order.push("app"));
    const off = subscribeNoteHandoffs("n1", () => order.push("editor"));
    subscribeNoteHandoffs("n2", () => order.push("other note"));
    expect(hasNoteHandoffListener("n1")).toBe(true);
    __receiveForTest(msg());
    expect(order).toEqual(["app", "editor"]);
    off();
    expect(hasNoteHandoffListener("n1")).toBe(false);
  });
});
