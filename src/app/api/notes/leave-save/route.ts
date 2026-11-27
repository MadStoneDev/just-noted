import { updateNote } from "@/app/actions/supabaseActions";
import { noteOperation } from "@/app/actions/notes";
import { LEAVE_SAVE_MAX_BYTES } from "@/utils/leave-save";
import { isValidConflictCopy } from "@/utils/background-conflict";
import { isValidUUID } from "@/utils/validation";

// Keepalive target for the tab-close flush (see utils/leave-save.ts). Saves a
// note's content as a BACKGROUND CAS write on baseVersion: if the server has
// moved past it (another device or tab edited), the stored note is left as it
// is and this text becomes a "(conflicted copy)" — never an overwrite. The copy
// id is the one the client's offline-queue entry for this same edit carries, so
// the queue replay on the next load can't make a second copy. Failures are fine
// to report and forget: that queue entry (and the other tabs' handoff copy)
// covers them.
//
// Auth / ownership — the same checks as the normal saves:
//   - cloud: the Supabase cookie session, enforced inside updateNote (author
//     match, RLS);
//   - guest: the anonymous device id the note is stored under, through the same
//     noteOperation("redis", update) path as the guest autosave: UUID-only id,
//     bot check, content checks, and a CAS on that id's own note hash (another
//     id's note is simply "not found").
// Cross-site requests are refused by Origin, on top of SameSite cookies. The
// body is read with a hard cap (a keepalive body is at most 64 KiB anyway).

/** Small headroom over the client cap for multi-byte JSON escaping. */
const MAX_BODY_BYTES = LEAVE_SAVE_MAX_BYTES * 2;

/** Read the body as text, giving up (null) as soon as it passes `max` bytes. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// E2E only: with E2E_TEST_HOOKS=1 on the server (set by playwright.config.ts,
// never in a deployed env), a request carrying the `e2e_drop_leave_save=1`
// cookie is accepted and NOT saved — so a test can prove the queue / cache /
// handoff paths recover the text on their own.
function dropForTest(request: Request): boolean {
  if (process.env.E2E_TEST_HOOKS !== "1") return false;
  return /(?:^|;\s*)e2e_drop_leave_save=1(?:;|$)/.test(request.headers.get("cookie") ?? "");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) {
    return Response.json({ error: "Too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { source = "supabase", userId, noteId, content, goal, goalType, baseVersion, copyId, copyStamp, collabState } =
    (body ?? {}) as Record<string, unknown>;
  const conflictCopy = { id: copyId, stamp: copyStamp };
  if (
    (source !== "supabase" && source !== "redis") ||
    typeof noteId !== "string" ||
    !noteId ||
    typeof content !== "string" ||
    (goal !== undefined && typeof goal !== "number") ||
    (goalType !== undefined && typeof goalType !== "string") ||
    (baseVersion !== undefined && (typeof baseVersion !== "number" || !Number.isInteger(baseVersion))) ||
    !isValidConflictCopy(conflictCopy) ||
    (source === "redis" && (typeof userId !== "string" || !isValidUUID(userId))) ||
    (collabState !== undefined && (typeof collabState !== "string" || source !== "supabase"))
  ) {
    return Response.json({ error: "Invalid data" }, { status: 400 });
  }

  // Without a base version there is nothing to CAS against; leave it to the
  // queue rather than force-write over a possibly newer server copy.
  if (typeof baseVersion !== "number") {
    return Response.json({ success: false, error: "version_required" }, { status: 409 });
  }

  if (dropForTest(request)) {
    console.log(`[e2e] leave-save dropped (test hook): ${source} ${noteId}`);
    return Response.json({ success: false, dropped: true }, { status: 202 });
  }

  const result =
    source === "redis"
      ? await noteOperation("redis", {
          operation: "update",
          userId: userId as string,
          noteId,
          content,
          goal: (goal as number) ?? 0,
          goalType: (goalType as string) ?? "",
          baseVersion,
          conflictCopy,
        })
      : await updateNote(noteId, content, (goal as number) ?? 0, (goalType as string) ?? "", {
          baseVersion,
          conflictCopy,
          // A collaborative note's doc state: merged into the stored doc rather
          // than version-checked (supabaseActions backgroundCollabWrite).
          ...(typeof collabState === "string" ? { collabState } : {}),
        });
  if (process.env.E2E_TEST_HOOKS === "1") {
    console.log(`[e2e] leave-save ${source} ${noteId}: ${result.success ? "saved" : `failed ${result.error}`}`);
  }
  if (result.success) {
    return Response.json({
      success: true,
      version: result.version,
      conflicted: !!result.conflicted,
      merged: !!(result as { merged?: boolean }).merged,
    });
  }
  return Response.json({ success: false }, { status: result.error === "Invalid data" ? 400 : 500 });
}
