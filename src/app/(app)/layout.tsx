import React from "react";
import NoteWrapper from "@/components/note-wrapper";

// The app shell. NoteWrapper (rail + views) lives here so it persists across the
// route group's pages (/, /roadmap, /settings, /admin) and re-renders on auth
// changes — a refresh keeps you where you were. Each page is a thin marker;
// NoteWrapper reads the URL to decide which view to show.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NoteWrapper />
      {children}
    </>
  );
}
