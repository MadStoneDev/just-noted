import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Reports this deploy's build id, read from Next's own .next/BUILD_ID — a single
// value generated once per build (unlike anything computed in next.config, which
// Next evaluates multiple times per build). The update banner captures whatever
// this returns on page load, then watches for it to change (= a new deploy).
export const dynamic = "force-dynamic";

let cached: string | null = null;

async function readBuildId(): Promise<string> {
  if (cached) return cached;
  try {
    cached = (await readFile(path.join(process.cwd(), ".next/BUILD_ID"), "utf8")).trim();
  } catch {
    cached = "dev"; // dev server / file absent — banner stays inert
  }
  return cached;
}

export async function GET() {
  const buildId = await readBuildId();
  return NextResponse.json(
    { buildId },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
