import { Metadata } from "next";
import RoadmapView from "@/components/roadmap-view";

// Server-rendered into the (app) shell's main slot (NoteWrapper renders it on
// /roadmap) so the board content is in the first HTML response.
export const metadata: Metadata = {
  title: "Roadmap — JustNoted",
  description: "What's shipped, in progress and planned for JustNoted, and what people have suggested.",
};

export default function RoadmapPage() {
  return <RoadmapView />;
}
