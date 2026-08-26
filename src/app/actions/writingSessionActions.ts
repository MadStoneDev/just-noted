"use server";

import { createClient } from "@/utils/supabase/server";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }
  return { supabase, userId: authData.user.id };
}

export interface WritingSession {
  id: string;
  userId: string;
  date: string;
  wordsWritten: number;
  durationSeconds: number;
}

export async function upsertWritingSession(data: {
  wordsWritten: number;
  durationSeconds: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase.rpc("upsert_writing_session", {
      p_user_id: userId,
      p_date: today,
      p_words: data.wordsWritten,
      p_duration: data.durationSeconds,
    });

    if (error) {
      const { error: fallbackError } = await supabase
        .from("writing_sessions")
        .upsert(
          {
            user_id: userId,
            date: today,
            words_written: data.wordsWritten,
            duration_seconds: data.durationSeconds,
          },
          { onConflict: "user_id,date" },
        );
      if (fallbackError) throw fallbackError;
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTodaySession(): Promise<{
  success: boolean;
  session?: WritingSession;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("writing_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true,
      session: data
        ? {
            id: data.id,
            userId: data.user_id,
            date: data.date,
            wordsWritten: data.words_written,
            durationSeconds: data.duration_seconds,
          }
        : undefined,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getWritingSessions(options?: {
  limit?: number;
}): Promise<{
  success: boolean;
  sessions?: WritingSession[];
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    let query = supabase
      .from("writing_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      sessions: (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        date: row.date,
        wordsWritten: row.words_written,
        durationSeconds: row.duration_seconds,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getWritingStreak(): Promise<{
  success: boolean;
  streak?: number;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("writing_sessions")
      .select("date, words_written")
      .eq("user_id", userId)
      .gt("words_written", 0)
      .order("date", { ascending: false })
      .limit(365);

    if (error) throw error;
    if (!data || data.length === 0) {
      return { success: true, streak: 0 };
    }

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const DAY_MS = 86400000;

    // The run counts as a *current* streak only if the most recent session is
    // today or yesterday. If the last write was 2+ days ago, the streak is 0.
    const mostRecent = new Date(data[0].date + "T00:00:00");
    mostRecent.setHours(0, 0, 0, 0);
    const daysSinceMostRecent = Math.round(
      (today.getTime() - mostRecent.getTime()) / DAY_MS,
    );
    if (daysSinceMostRecent > 1) {
      return { success: true, streak: 0 };
    }

    // Walk consecutive days backward from the most recent session date, anchored
    // to that date (not to `today`) so a run ending yesterday counts fully.
    // Duplicate rows for the same day are skipped without advancing the anchor.
    const expectedDate = new Date(mostRecent);
    for (let i = 0; i < data.length; i++) {
      const sessionDate = new Date(data[i].date + "T00:00:00");
      sessionDate.setHours(0, 0, 0, 0);

      if (sessionDate.getTime() === expectedDate.getTime()) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (sessionDate.getTime() < expectedDate.getTime()) {
        // A day was skipped — the streak ends here.
        break;
      }
      // sessionDate > expectedDate => duplicate/same-day row already counted; skip.
    }

    return { success: true, streak };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
