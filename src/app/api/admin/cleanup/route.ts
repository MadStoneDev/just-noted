import { NextRequest, NextResponse } from "next/server";
import { cleanupOldNotes } from "@/utils/redis/redisCleanup";
import crypto from "crypto";

/**
 * Timing-safe comparison of API keys to prevent timing attacks
 */
function verifyApiKey(provided: string, expected: string): boolean {
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    // If lengths differ, we still need to do a comparison to maintain constant time
    if (providedBuffer.length !== expectedBuffer.length) {
      // Compare against expected to maintain timing consistency
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Validate API key for security
  const apiKey = request.headers.get("x-api-key");
  const expectedApiKey = process.env.CLEANUP_API_KEY;

  if (!apiKey || !expectedApiKey || !verifyApiKey(apiKey, expectedApiKey)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    // Run the cleanup operation
    const result = await cleanupOldNotes();

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error) {
    console.error("Error in cleanup endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error during cleanup",
        error: String(error),
      },
      { status: 500 },
    );
  }
}

// Optionally add a GET handler for testing purposes
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  const expectedApiKey = process.env.CLEANUP_API_KEY;

  if (!apiKey || !expectedApiKey || !verifyApiKey(apiKey, expectedApiKey)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Cleanup endpoint is active. Send a POST request to run the cleanup.",
  });
}
