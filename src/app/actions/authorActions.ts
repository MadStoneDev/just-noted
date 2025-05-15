"use server";

import { createClient } from "@/utils/supabase/server";
import { generateRandomUsername } from "@/utils/general/username-generator";

export async function createAuthorRecord(userId: string, redisUserId = "") {
  try {
    // Get Redis user ID from localStorage if not provided
    const finalRedisUserId =
      redisUserId || localStorage.getItem("redisUserId") || "";

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("authors")
      .insert({
        id: userId,
        username: generateRandomUsername(), // You'll need this function
        redis_user_id: finalRedisUserId,
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      })
      .select()
      .single();

    return { data, error };
  } catch (err) {
    console.error("Error creating author record:", err);
    return { data: null, error: err };
  }
}
