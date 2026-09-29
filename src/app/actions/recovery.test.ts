import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  generateRecoveryKey,
  normalizeRecoveryKey,
  isValidRecoveryKeyFormat,
  hashRecoveryKey,
  RECOVERY_ALPHABET,
} from "@/utils/recovery-key";

// ── Shared in-memory Redis for the mocked clients ──
const h = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  counters: new Map<string, number>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "x-forwarded-for" ? "1.2.3.4" : null),
  }),
}));

vi.mock("@/utils/redis", () => {
  const raw = {
    get: async (k: string) => h.kv.get(k) ?? null,
    set: async (k: string, v: string) => {
      h.kv.set(k, String(v));
    },
    del: async (k: string) => {
      h.kv.delete(k);
      return 1;
    },
    hgetall: async () => null,
    type: async () => "none",
    hget: async () => null,
    hset: async () => 1,
    hdel: async () => 0,
    eval: async () => 0,
  };
  const def = {
    incr: async (k: string) => {
      const n = (h.counters.get(k) ?? 0) + 1;
      h.counters.set(k, n);
      return n;
    },
    expire: async () => 1,
  };
  return { default: def, redisRaw: raw };
});

process.env.RECOVERY_KEY_PEPPER = "test-pepper";

// Imported after the mock + env are set up.
import { createRecoveryKey, recoverWithKey, getRecoveryStatus } from "./recoveryActions";

const ANON = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  h.kv.clear();
  h.counters.clear();
});

describe("recovery key util", () => {
  it("generates a 5x5 key from the unambiguous alphabet", () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    for (const c of key.replace(/-/g, "")) expect(RECOVERY_ALPHABET).toContain(c);
    // no ambiguous characters
    expect(key).not.toMatch(/[0O1IL]/);
  });

  it("normalises input (case, dashes, spaces) and validates length", () => {
    const key = generateRecoveryKey();
    const messy = ` ${key.toLowerCase()} `.replace(/-/g, " ");
    const norm = normalizeRecoveryKey(messy);
    expect(norm).toBe(normalizeRecoveryKey(key));
    expect(isValidRecoveryKeyFormat(norm)).toBe(true);
  });

  it("hash is deterministic and pepper-dependent", () => {
    const n = normalizeRecoveryKey(generateRecoveryKey());
    expect(hashRecoveryKey(n, "p1")).toBe(hashRecoveryKey(n, "p1"));
    expect(hashRecoveryKey(n, "p1")).not.toBe(hashRecoveryKey(n, "p2"));
  });
});

describe("recovery actions", () => {
  it("a correct key recovers the anon id", async () => {
    const { success, key } = await createRecoveryKey(ANON);
    expect(success).toBe(true);
    const res = await recoverWithKey(key!);
    expect(res.success).toBe(true);
    expect(res.anonId).toBe(ANON);
  });

  it("a wrong key fails generically and never returns an anon id", async () => {
    await createRecoveryKey(ANON);
    const res = await recoverWithKey("WRONG-WRONG-WRONG-WRONG-WRONG");
    expect(res.success).toBe(false);
    expect(res.anonId).toBeUndefined();
  });

  it("regenerating invalidates the old key", async () => {
    const first = await createRecoveryKey(ANON);
    const second = await createRecoveryKey(ANON); // regenerate
    expect(second.key).not.toBe(first.key);

    const oldTry = await recoverWithKey(first.key!);
    expect(oldTry.success).toBe(false);

    const newTry = await recoverWithKey(second.key!);
    expect(newTry.success).toBe(true);
    expect(newTry.anonId).toBe(ANON);
  });

  it("rate-limits recovery attempts per IP (5 per window)", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await recoverWithKey("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA");
      expect(r.error).not.toMatch(/Too many/);
    }
    const sixth = await recoverWithKey("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA");
    expect(sixth.success).toBe(false);
    expect(sixth.error).toMatch(/Too many/);
  });

  it("getRecoveryStatus reflects whether a key exists, without leaking the anon id", async () => {
    expect((await getRecoveryStatus(ANON)).exists).toBe(false);
    await createRecoveryKey(ANON);
    const status = await getRecoveryStatus(ANON);
    expect(status.exists).toBe(true);
    // status carries no anon id
    expect(JSON.stringify(status)).not.toContain(ANON);
    // an unrelated device has no key
    expect((await getRecoveryStatus(OTHER)).exists).toBe(false);
  });
});
