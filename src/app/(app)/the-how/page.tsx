import { Metadata } from "next";
import TheHowView from "@/components/the-how-view";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /the-how) so the content is in the first HTML response for search.
export const metadata: Metadata = {
  title: "The How — JustNoted",
  description:
    "With privacy in mind, JustNoted, the distraction-free note-taking app, saves your notes without stealing any private information about you. Find out how it works.",
};

export default function TheHowPage() {
  return <TheHowView />;
}
