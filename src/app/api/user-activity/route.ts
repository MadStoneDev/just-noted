import redis from "@/utils/redis";
import { TWO_MONTHS_IN_SECONDS, USER_ACTIVITY_PREFIX } from "@/constants/app";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    // Verify authentication - user can only update their own activity
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Use authenticated user's ID instead of request body
    const userId = user.id;

    await redis.setex(
      `${USER_ACTIVITY_PREFIX}${userId}`,
      TWO_MONTHS_IN_SECONDS,
      Date.now().toString(),
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update user activity:", error);
    return Response.json(
      { error: "Failed to update activity" },
      { status: 500 },
    );
  }
}
