import redis from "@/utils/redis";
import { GUEST_NOTE_RETENTION_SECONDS, USER_ACTIVITY_PREFIX } from "@/constants/app";

// Anonymous ids (localStorage UUID) and Supabase auth ids both match this.
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Record a user's last-access timestamp so the Redis cleanup job can tell an
 * abandoned account from an active one.
 *
 * IMPORTANT: guests must be recorded too. Their Redis notes are keyed by an
 * anonymous id, not a Supabase auth id, and they have no session — so the old
 * "require auth + use user.id" logic never recorded them, which meant the
 * cleanup job would have treated every guest (and every signed-in user's
 * on-device notes) as inactive. We record whatever validated id the client
 * sends (the same id that keys `notes:{id}`). Keeping an id "active" only ever
 * preserves data, so accepting it unauthenticated is safe; we validate the id
 * shape to avoid key injection.
 */
export async function POST(request: Request) {
  try {
    let userId: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.userId === "string") userId = body.userId.trim();
    } catch {
      // no/invalid body
    }

    if (!userId || !ID_RE.test(userId)) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    await redis.setex(
      `${USER_ACTIVITY_PREFIX}${userId}`,
      GUEST_NOTE_RETENTION_SECONDS,
      Date.now().toString(),
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update user activity:", error);
    return Response.json({ error: "Failed to update activity" }, { status: 500 });
  }
}
