// Curated, USER-FACING roadmap shown in-app (Help → Roadmap).
// This is intentionally separate from docs/roadmap.md (the internal engineering
// plan) so implementation detail never leaks to users. Edit this list to change
// what people see; keep blurbs short, benefit-focused, and free of dates.

export type RoadmapStatus = "shipped" | "in-progress" | "planned";

export interface RoadmapItem {
  title: string;
  blurb: string;
}

export interface RoadmapGroup {
  status: RoadmapStatus;
  label: string;
  items: RoadmapItem[];
}

export const ROADMAP: RoadmapGroup[] = [
  {
    status: "in-progress",
    label: "In progress",
    items: [
      {
        title: "Note conversations",
        blurb:
          "Chat on any note, and pin a comment to a specific line or word so everyone knows exactly what you mean.",
      },
    ],
  },
  {
    status: "planned",
    label: "Planned",
    items: [
      {
        title: "Notifications",
        blurb:
          "Know when someone comments, mentions you, or edits a note shared with you.",
      },
      {
        title: "Richer shared notes",
        blurb:
          "Export, print and version history on every shared note — not just your own.",
      },
      {
        title: "Smarter conversations",
        blurb:
          "Summarise a discussion or turn it into edits, right where you're writing.",
      },
    ],
  },
  {
    status: "shipped",
    label: "Recently shipped",
    items: [
      {
        title: "Keyboard shortcuts & Help",
        blurb: "A quick reference to everything, right inside the app.",
      },
      {
        title: "Unlimited notebooks on Scribe",
        blurb: "Organise as much as you like — no notebook cap on Scribe.",
      },
      {
        title: "A safer Trash",
        blurb:
          "Deleted notes wait in Trash before they're gone — 30 days on Draft, up to 90 on Scribe.",
      },
      {
        title: "Cleaner shared notes",
        blurb:
          "Shared notes now match the editor, with live word and character counts.",
      },
      {
        title: "“Update ready” prompt",
        blurb:
          "When a new version ships, we'll offer a refresh — and save your note first.",
      },
    ],
  },
];
