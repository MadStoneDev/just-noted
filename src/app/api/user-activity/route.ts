import redis from "@/utils/redis";
import { TWO_MONTHS_IN_SECONDS } from "@/constants/app";

export async function POST(request: Request) {
  const { userId } = await request.json();

  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  // Set last access timestamp with 2-month TTL
  await redis.setex(
    `user:activity:${userId}`,
    TWO_MONTHS_IN_SECONDS,
    Date.now().toString(),
  );

  return Response.json({ success: true });
}
