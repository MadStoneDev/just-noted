import React from "react";
import NoteWrapper from "@/components/note-wrapper";

// The app shell. NoteWrapper (rail + views) lives here so it persists across the
// route group's pages and re-renders on auth changes — a refresh keeps you where
// you were.
//
// Public routed views (Pricing, Roadmap, the-how, the-what, Tools) render their
// content SERVER-SIDE in the marker page and are passed in as `mainSlot`;
// NoteWrapper renders that slot in the main area on those routes, so the content
// is in the first HTML response (SEO). Private views (notebooks, settings, admin,
// trash) stay client-rendered inside NoteWrapper and their marker pages return
// null (so the slot is empty).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <NoteWrapper mainSlot={children} />;
}
