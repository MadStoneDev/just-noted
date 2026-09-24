import { NextResponse } from "next/server";

// Reports the running deploy's build id. NEXT_PUBLIC_BUILD_ID is inlined at
// build time (see next.config.ts), so this returns THIS deploy's value while an
// already-loaded client holds its own — the update banner compares the two.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
