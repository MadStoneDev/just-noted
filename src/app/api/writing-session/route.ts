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

    if (typeof wordsWritten !== "number" || typeof durationSeconds !== "number") {
      return Response.json({ error: "Invalid data" }, { status: 400 });
    }

    if (wordsWritten === 0 && durationSeconds === 0) {
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
          words_written: existing.words_written + wordsWritten,
          duration_seconds: existing.duration_seconds + durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("writing_sessions").insert({
        user_id: user.id,
        date: today,
        words_written: Math.max(0, wordsWritten),
        duration_seconds: Math.max(0, durationSeconds),
      });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
