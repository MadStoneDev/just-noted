import { NextResponse } from "next/server";
import { loadSidebar } from "@/lib/sidebar-access";

// Batched sidebar read (notebooks + tags + counts) as a Route Handler so it runs
// concurrently and does one getUser() instead of three separate server actions.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadSidebar());
  } catch {
    return NextResponse.json({ notebooks: [], tags: [], counts: {}, looseCount: 0 }, { status: 500 });
  }
}
