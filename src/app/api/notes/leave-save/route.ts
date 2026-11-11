import { updateNote } from "@/app/actions/supabaseActions";
import { LEAVE_SAVE_MAX_BYTES } from "@/utils/leave-save";

// Keepalive target for the tab-close flush (see utils/leave-save.ts). Saves a
// cloud note's content with the normal CAS path (baseVersion). A conflict or any
// failure is fine to report and forget: the client also queued the edit offline,
// and that queue entry syncs (and resolves) on the next load.
//
// Auth is the Supabase cookie session, enforced inside updateNote (author match).
// Cross-site requests are refused by Origin, on top of SameSite cookies.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await request.text();
  // Small headroom over the client cap for multi-byte JSON escaping.
  if (raw.length > LEAVE_SAVE_MAX_BYTES * 2) {
    return Response.json({ error: "Too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { noteId, content, goal, goalType, baseVersion } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof noteId !== "string" ||
    !noteId ||
    typeof content !== "string" ||
    (goal !== undefined && typeof goal !== "number") ||
    (goalType !== undefined && typeof goalType !== "string") ||
    (baseVersion !== undefined && (typeof baseVersion !== "number" || !Number.isInteger(baseVersion)))
  ) {
    return Response.json({ error: "Invalid data" }, { status: 400 });
  }

  // Without a base version there is nothing to CAS against; leave it to the
  // queue rather than force-write over a possibly newer server copy.
  if (typeof baseVersion !== "number") {
    return Response.json({ success: false, error: "version_required" }, { status: 409 });
  }

  const result = await updateNote(noteId, content, (goal as number) ?? 0, (goalType as string) ?? "", {
    baseVersion,
  });
  if (result.success) return Response.json({ success: true, version: result.version });
  return Response.json(
    { success: false, conflict: !!(result as { conflict?: boolean }).conflict },
    { status: (result as { conflict?: boolean }).conflict ? 409 : 500 },
  );
}
