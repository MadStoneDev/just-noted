import { Metadata } from "next";

// Rendered by NoteWrapper (in the (app) layout) via the URL — the single-notebook
// view (Level 2) opens inside the app shell. Marker page; NoteWrapper reads the
// :id from the path.
export const metadata: Metadata = {
  title: "Notebook — JustNoted",
};

export default function NotebookViewPage() {
  return null;
}
