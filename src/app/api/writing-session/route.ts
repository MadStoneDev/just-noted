import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { wordsWritten, durationSeconds } = body;

    if (
      typeof wordsWritten !== "number" ||
      typeof durationSeconds !== "number" ||
      !Number.isFinite(wordsWritten) ||
      !Number.isFinite(durationSeconds)
    ) {
      return Response.json({ error: "Invalid data" }, { status: 400 });
    }

    // Clamp to sane, non-negative bounds so a crafted request can't corrupt
    // the user's aggregated stats (applies to both insert and update paths).
    const safeWords = Math.min(Math.max(0, Math.floor(wordsWritten)), 1_000_000);
    const safeDuration = Math.min(Math.max(0, Math.floor(durationSeconds)), 86_400);

    if (safeWords === 0 && safeDuration === 0) {
      return Response.json({ success: true });
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("writing_sessions")
      .select("id, words_written, duration_seconds")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("writing_sessions")
        .update({
          words_written: Math.max(0, existing.words_written + safeWords),
          duration_seconds: Math.max(0, existing.duration_seconds + safeDuration),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("writing_sessions").insert({
        user_id: user.id,
        date: today,
        words_written: safeWords,
        duration_seconds: safeDuration,
      });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
