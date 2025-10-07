import redis from "@/utils/redis";
import { TWO_MONTHS_IN_SECONDS, USER_ACTIVITY_PREFIX } from "@/constants/app";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

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
