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

// Editor body font size (handoff: adjustable 16–24; spec default 20).
const SIZE_KEY = "justnoted_editor_font_size";
export const FONT_SIZE_MIN = 16;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 18;

export function readEditorFontSize(): number {
  if (typeof window === "undefined") return FONT_SIZE_DEFAULT;
  try {
    const v = parseInt(localStorage.getItem(SIZE_KEY) || "", 10);
    if (v >= FONT_SIZE_MIN && v <= FONT_SIZE_MAX) return v;
  } catch {}
  return FONT_SIZE_DEFAULT;
}

export function applyEditorFontSize(px: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
}

export function writeEditorFontSize(px: number): void {
  try {
    localStorage.setItem(SIZE_KEY, String(px));
  } catch {}
  applyEditorFontSize(px);
}
