import { describe, it, expect } from "vitest";
import { decideNoteSwitch } from "./note-switch-focus";

const base = { modalOpen: false, activeIsTextField: false, activeInEditorRegion: false };

describe("decideNoteSwitch", () => {
  it("switches and focuses the editor from a neutral focus (body / sidebar row)", () => {
    expect(decideNoteSwitch(base)).toEqual({ handle: true, focusEditor: true });
  });

  it("focuses the new editor when typing in the current note (body or title)", () => {
    expect(
      decideNoteSwitch({ ...base, activeIsTextField: true, activeInEditorRegion: true }),
    ).toEqual({ handle: true, focusEditor: true });
  });

  it("switches but keeps focus in a text field outside the editor (sidebar filter)", () => {
    expect(decideNoteSwitch({ ...base, activeIsTextField: true })).toEqual({
      handle: true,
      focusEditor: false,
    });
  });

  it("ignores the shortcut entirely while a modal (search / palette / dialog) is open", () => {
    expect(decideNoteSwitch({ ...base, modalOpen: true })).toEqual({
      handle: false,
      focusEditor: false,
    });
    expect(
      decideNoteSwitch({ modalOpen: true, activeIsTextField: true, activeInEditorRegion: true }),
    ).toEqual({ handle: false, focusEditor: false });
  });
});
