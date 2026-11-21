import { describe, it, expect } from "vitest";
import { decideEditorChange, isEditingInputEvent, LOAD_EMISSION_WINDOW_MS } from "./editor-save-decision";

// A note with headings, lists, bold, inline code and links — the kind of
// content whose Milkdown round-trip re-serialises to slightly different bytes.
const STORED = [
  "# Heading",
  "",
  "Some **bold** text and `inline code` and a [link](https://example.com).",
  "",
  "- one",
  "- two",
  "- three",
  "",
  "1. first",
  "2. second",
].join("\n");

// What the editor emits on mount: same meaning, different bytes (escaped chars,
// list markers, a trailing newline — exactly the harmless drift we must ignore).
const RESERIALIZED = [
  "# Heading",
  "",
  "Some **bold** text and `inline code` and a [link](https://example.com).",
  "",
  "*   one",
  "*   two",
  "*   three",
  "",
  "1.  first",
  "2.  second",
  "",
].join("\n");

describe("decideEditorChange", () => {
  it("does NOT save when a rich-markdown note loads (first emission after mount)", () => {
    const decision = decideEditorChange({
      value: RESERIALIZED,
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: false,
      msSinceMount: 5, // the re-serialisation lands synchronously on mount
    });
    expect(decision.persist).toBe(false);
    expect(decision.adoptBaseline).toBe(true);
  });

  it("adopts the re-serialisation as the baseline even though the bytes differ", () => {
    const decision = decideEditorChange({
      value: RESERIALIZED,
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: false,
      msSinceMount: 0,
    });
    // value !== baseline, yet it must not be treated as an edit.
    expect(RESERIALIZED).not.toEqual(STORED);
    expect(decision.adoptBaseline).toBe(true);
    expect(decision.persist).toBe(false);
  });

  it("persists a real edit made after the note has loaded", () => {
    const decision = decideEditorChange({
      value: STORED + "\n\nA new paragraph I typed.",
      baseline: STORED,
      awaitingLoadEmission: false,
      userInputSinceMount: false,
      msSinceMount: 8000,
    });
    expect(decision.persist).toBe(true);
    expect(decision.adoptBaseline).toBe(false);
  });

  it("does nothing when the emission equals the baseline", () => {
    const decision = decideEditorChange({
      value: STORED,
      baseline: STORED,
      awaitingLoadEmission: false,
      userInputSinceMount: false,
      msSinceMount: 8000,
    });
    expect(decision.persist).toBe(false);
    expect(decision.adoptBaseline).toBe(false);
  });

  it("persists the first keystroke in an empty new note (never armed)", () => {
    // Empty notes have no stored content to re-serialise, so awaitingLoadEmission
    // is false — the first character must save (regression guard for new notes).
    const decision = decideEditorChange({
      value: "h",
      baseline: "",
      awaitingLoadEmission: false,
      userInputSinceMount: false,
      msSinceMount: 20,
    });
    expect(decision.persist).toBe(true);
  });

  it("treats a late first emission as a real edit, not a load baseline", () => {
    // If no mount re-serialisation ever fired (already-canonical content), a
    // keystroke well past the window is a genuine edit and must save — it must
    // not be silently swallowed as the load baseline.
    const decision = decideEditorChange({
      value: STORED + " edited",
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: false,
      msSinceMount: LOAD_EMISSION_WINDOW_MS + 500,
    });
    expect(decision.persist).toBe(true);
    expect(decision.adoptBaseline).toBe(false);
  });

  // Ticket: saving-stuck-after-load-window-keystroke. A keystroke inside the
  // load window was adopted as the baseline: never saved, and the editor's
  // baseline then disagreed with useAutoSave's.
  it("persists a keystroke inside the load window once the user has input", () => {
    const decision = decideEditorChange({
      value: STORED + "Q",
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: true,
      msSinceMount: 250,
    });
    expect(decision.adoptBaseline).toBe(false);
    expect(decision.persist).toBe(true);
  });

  it("persists a combined load re-serialisation + keystroke as an edit", () => {
    // The user typed before the (debounced) load emission arrived: one emission
    // carries both. It is an edit — saving the harmless normalisation with it is fine.
    const decision = decideEditorChange({
      value: RESERIALIZED + "Q",
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: true,
      msSinceMount: 120,
    });
    expect(decision.persist).toBe(true);
  });

  it("still adopts the load emission when it lands before any input", () => {
    const decision = decideEditorChange({
      value: RESERIALIZED,
      baseline: STORED,
      awaitingLoadEmission: true,
      userInputSinceMount: false,
      msSinceMount: 300,
    });
    expect(decision.adoptBaseline).toBe(true);
    expect(decision.persist).toBe(false);
  });

  it("flags an edit back to the saved text", () => {
    const decision = decideEditorChange({
      value: STORED,
      baseline: STORED,
      awaitingLoadEmission: false,
      userInputSinceMount: true,
      msSinceMount: 3000,
    });
    expect(decision).toEqual({ adoptBaseline: false, persist: false, backToBaseline: true });
  });
});

describe("isEditingInputEvent", () => {
  it("counts text input, paste, drop, cut and IME composition", () => {
    for (const type of ["beforeinput", "paste", "drop", "cut", "compositionstart"]) {
      expect(isEditingInputEvent({ type })).toBe(true);
    }
  });

  it("counts editing keys (ProseMirror handles some on keydown, with no beforeinput)", () => {
    for (const key of ["q", "Q", " ", "Enter", "Backspace", "Delete", "Tab"]) {
      expect(isEditingInputEvent({ type: "keydown", key })).toBe(true);
    }
    expect(isEditingInputEvent({ type: "keydown", key: "b", ctrlKey: true })).toBe(true); // bold
    expect(isEditingInputEvent({ type: "keydown", key: "v", metaKey: true })).toBe(true); // paste
  });

  it("ignores navigation, modifiers, F-keys, copy and select-all", () => {
    for (const key of ["ArrowLeft", "End", "Home", "PageDown", "Shift", "Control", "Meta", "Escape", "F5", "F12"]) {
      expect(isEditingInputEvent({ type: "keydown", key })).toBe(false);
    }
    expect(isEditingInputEvent({ type: "keydown", key: "c", ctrlKey: true })).toBe(false);
    expect(isEditingInputEvent({ type: "keydown", key: "a", metaKey: true })).toBe(false);
    expect(isEditingInputEvent({ type: "focus" })).toBe(false);
    expect(isEditingInputEvent({ type: "pointerdown" })).toBe(false);
  });
});
