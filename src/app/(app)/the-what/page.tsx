import { Metadata } from "next";
import TheWhatView from "@/components/the-what-view";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /the-what) so the content is in the first HTML response for search.
export const metadata: Metadata = {
  title: "The What — JustNoted",
  description:
    "JustNoted in a nutshell is a simple distraction-free note-taking app that's easy to use and doesn't require any sign-up or registration.",
};

export default function TheWhatPage() {
  return <TheWhatView />;
}
