import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/utils/rate-limit";
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
// Fixed-window rate limit: at most RL_MAX writes per RL_WINDOW seconds per IP.
// The client only pings every ~5 minutes, so this is generous for real use while
// capping abuse of the now-unauthenticated endpoint.
const RL_WINDOW = 60;
const RL_MAX = 30;

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      "unknown";
    // Fails open: if Valkey is down the limiter allows the request.
    const rl = await checkRateLimit(ip, "activity", RL_MAX, RL_WINDOW * 1000);
    if (!rl.allowed) {
      return Response.json({ error: "Rate limited" }, { status: 429 });
    }

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

    try {
      await redis.set(
        `${USER_ACTIVITY_PREFIX}${userId}`,
        Date.now().toString(),
        "EX",
        GUEST_NOTE_RETENTION_SECONDS,
      );
    } catch (error) {
      // Best-effort: a missed ping only means the cleanup job falls back to the
      // notes' own timestamps. Report "unavailable", never a 500.
      console.error("Failed to record user activity (Valkey unavailable):", error);
      return Response.json({ success: false }, { status: 503 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update user activity:", error);
    return Response.json({ error: "Failed to update activity" }, { status: 500 });
  }
}
