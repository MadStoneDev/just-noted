import Redis from "ioredis";

/**
 * The one shared Valkey (Redis-protocol) client for this process.
 *
 * - Every key is namespaced with KEY_PREFIX so several projects can share one
 *   Valkey instance. ioredis adds it to command keys (incl. EVAL KEYS) but NOT
 *   to SCAN MATCH patterns or SCAN results — use `scanKeys` for that.
 * - Values are raw strings: JSON.stringify on write, JSON.parse on read.
 * - Timeouts are short so a Valkey outage fails a request in ~1.5s instead of
 *   hanging it. Callers decide whether that failure is fatal (note storage) or
 *   ignorable (rate limits — see utils/rate-limit.ts).
 * - Created on first use, not at import, so `next build` never needs
 *   VALKEY_URL or a reachable server.
 */
export const KEY_PREFIX = "justnoted:";

const TIMEOUT_MS = 1500;

declare global {
  // Kept on globalThis so dev hot reloads reuse one connection.
  var __justnotedRedis: Redis | undefined;
}

let lastErrorLog = 0;

function createClient(): Redis {
  const url = process.env.VALKEY_URL;
  if (!url) throw new Error("VALKEY_URL environment variable is required");

  const client = new Redis(url, {
    keyPrefix: KEY_PREFIX,
    lazyConnect: true,
    connectTimeout: TIMEOUT_MS,
    commandTimeout: TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    // Reconnect forever, backing off 100ms, 200ms, ... capped at 2s.
    retryStrategy: (times) => Math.min(times * 100, 2000),
  });

  // Without a listener ioredis logs every failed reconnect as an unhandled
  // error. Log at most once every 30s while the server is unreachable.
  client.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 30_000) {
      lastErrorLog = now;
      console.error("[valkey] connection error:", err.message);
    }
  });

  return client;
}

export function getRedis(): Redis {
  return (globalThis.__justnotedRedis ??= createClient());
}

/**
 * The shared client. A thin proxy over `getRedis()` so importing this module
 * never creates a connection or reads env — the first command does.
 */
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * All keys matching `pattern` (given WITHOUT the project prefix), returned
 * WITHOUT the prefix — so they can be passed straight back to other commands,
 * which re-add it.
 */
export async function scanKeys(pattern: string, count = 500): Promise<string[]> {
  const out: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${KEY_PREFIX}${pattern}`, "COUNT", count);
    cursor = next;
    for (const k of keys) out.push(k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k);
  } while (cursor !== "0");
  return out;
}
