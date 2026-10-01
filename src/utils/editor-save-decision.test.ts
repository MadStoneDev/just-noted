import { describe, it, expect } from "vitest";
import { decideEditorChange, LOAD_EMISSION_WINDOW_MS } from "./editor-save-decision";

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
      msSinceMount: LOAD_EMISSION_WINDOW_MS + 500,
    });
    expect(decision.persist).toBe(true);
    expect(decision.adoptBaseline).toBe(false);
  });
});
