// Roadmap status values. Lives outside the "use server" action files because a
// server-action module may only export async functions (not runtime consts), and
// client components import these directly.
export const ROADMAP_STATUSES = [
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;

export type RoadmapStatusValue = (typeof ROADMAP_STATUSES)[number];
