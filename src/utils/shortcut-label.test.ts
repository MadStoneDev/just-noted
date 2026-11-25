import { describe, it, expect } from "vitest";
import { formatShortcut, shortcutKeys } from "./shortcut-label";
import { KEYBOARD_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts";

describe("shortcut labels", () => {
  it("Mac: ⌘ symbols in Apple order, run together", () => {
    expect(formatShortcut(["Mod", "J"], true)).toBe("⌘J");
    expect(formatShortcut(["Mod", "Shift", "S"], true)).toBe("⇧⌘S");
    expect(formatShortcut(["Mod", "Alt", "↑/↓"], true)).toBe("⌥⌘↑/↓");
    expect(shortcutKeys(["Mod", "Shift", "M"], true)).toEqual(["⇧", "⌘", "M"]);
  });
  it("elsewhere: Ctrl, joined with +", () => {
    expect(formatShortcut(["Mod", "J"], false)).toBe("Ctrl+J");
    expect(formatShortcut(["Mod", "Shift", "S"], false)).toBe("Ctrl+Shift+S");
    expect(formatShortcut(["Mod", "Alt", "1"], false)).toBe("Ctrl+Alt+1");
  });
  it("the shortcut list uses Mod, so it never shows a fixed Ctrl or ⌘", () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      expect(s.keys).not.toContain("Ctrl");
      expect(s.keys).not.toContain("⌘");
      if (s.keys.length > 1) expect(s.keys[0]).toBe("Mod");
    }
  });
});
