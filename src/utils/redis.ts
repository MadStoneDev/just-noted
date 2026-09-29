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

// A second client with deserialization OFF, used by the per-note hash store
// (note-store.ts). It reads/writes raw JSON strings so a full-value
// compare-and-set in Lua can match the stored value byte-for-byte (auto-parsed
// objects wouldn't re-serialize identically).
export const redisRaw = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  retry: {
    retries: 3,
    backoff: (retryCount) => Math.pow(2, retryCount) * 1000,
  },
  automaticDeserialization: false,
});

export default redis;
