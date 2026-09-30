import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processExport } from "@/utils/account/export-runner";

export const dynamic = "force-dynamic";

// QStash delivers the export job here. Requests are verified with the QStash
// signature (QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY) — the payload
// carries only an export id; all content is gathered server-side.
export async function POST(req: NextRequest) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    console.error("[export worker] QStash signing keys are not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const bodyText = await req.text();
  const signature = req.headers.get("upstash-signature") || "";
  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const valid = await receiver.verify({ signature, body: bodyText });
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let exportId: string | undefined;
  try {
    const body = JSON.parse(bodyText);
    exportId = typeof body?.exportId === "string" ? body.exportId : undefined;
  } catch {
    /* fall through */
  }
  if (!exportId) return NextResponse.json({ error: "Missing exportId" }, { status: 400 });

  const result = await processExport(exportId);
  return NextResponse.json({ success: result.ok }, { status: result.ok ? 200 : 500 });
}
