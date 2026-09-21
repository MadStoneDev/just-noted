// User-selectable editor body font (handoff: Appearance → Editor font).
// Swaps the --font-editor token only; UI chrome (--font-ui) is unaffected.
export type EditorFont = "serif" | "sans" | "mono";

const KEY = "justnoted_editor_font";

const STACKS: Record<EditorFont, string> = {
  serif: 'var(--font-newsreader), "Playfair Display", Georgia, serif',
  sans: 'var(--font-public-sans), "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

export function readEditorFont(): EditorFont {
  if (typeof window === "undefined") return "serif";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "serif" || v === "sans" || v === "mono") return v;
  } catch {}
  return "serif";
}

export function applyEditorFont(font: EditorFont): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--font-editor", STACKS[font]);
}

export function writeEditorFont(font: EditorFont): void {
  try {
    localStorage.setItem(KEY, font);
  } catch {}
  applyEditorFont(font);
}
