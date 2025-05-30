import { Redis } from "@upstash/redis";

// Validate environment variables
if (!process.env.UPSTASH_REDIS_REST_URL) {
  throw new Error("UPSTASH_REDIS_REST_URL environment variable is required");
}

if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error("UPSTASH_REDIS_REST_TOKEN environment variable is required");
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,

  // Add retry configuration for better reliability
  retry: {
    retries: 3,
    backoff: (retryCount) => Math.pow(2, retryCount) * 1000, // Exponential backoff
  },
  // Add timeout configuration
  automaticDeserialization: true,
});

export default redis;
