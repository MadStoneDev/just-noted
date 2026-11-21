"use server";

import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/utils/rate-limit";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import {
  generateRecoveryKey,
  normalizeRecoveryKey,
  hashRecoveryKey,
  isValidRecoveryKeyFormat,
} from "@/utils/recovery-key";
import { readAllNotes, putNotes, NOTES_HASH_PREFIX } from "@/utils/redis/note-store";

const ANON_RE = /^[0-9a-fA-F-]{36}$/;
const RECOVERY_PREFIX = "recovery:"; // recovery:{hash} -> anonId
const RECOVERY_OWNER_PREFIX = "recovery_owner:"; // recovery_owner:{anonId} -> current hash
const RL_MAX = 5;
const RL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const GENERIC_FAIL = "That recovery key isn't valid.";

function getPepper(): string {
  const p = process.env.RECOVERY_KEY_PEPPER;
  if (!p) throw new Error("RECOVERY_KEY_PEPPER is not configured");
  return p;
}

/** Whether this device already has a recovery key (only the hash is stored, so
 *  we can never re-show an existing key — the UI offers Regenerate instead). */
export async function getRecoveryStatus(anonId: string): Promise<{ exists: boolean }> {
  if (!ANON_RE.test(anonId)) return { exists: false };
  const h = await redis.get(`${RECOVERY_OWNER_PREFIX}${anonId}`);
  return { exists: !!h };
}

/** Create (or regenerate) the recovery key. Returns the plaintext ONCE; only a
 *  hash is stored. Regenerating invalidates the previous key's hash. */
export async function createRecoveryKey(
  anonId: string,
): Promise<{ success: boolean; key?: string; error?: string }> {
  if (!ANON_RE.test(anonId)) return { success: false, error: "Invalid device id" };
  try {
    const pepper = getPepper();
    const key = generateRecoveryKey();
    const hash = hashRecoveryKey(normalizeRecoveryKey(key), pepper);

    const oldHash = await redis.get(`${RECOVERY_OWNER_PREFIX}${anonId}`);
    if (oldHash) await redis.del(`${RECOVERY_PREFIX}${oldHash}`);

    await redis.set(`${RECOVERY_PREFIX}${hash}`, anonId);
    await redis.set(`${RECOVERY_OWNER_PREFIX}${anonId}`, hash);

    return { success: true, key };
  } catch (e) {
    console.error("createRecoveryKey failed:", e);
    return { success: false, error: "Couldn't create a recovery key right now." };
  }
}

/** Look up the anon id for a recovery key. Rate-limited per IP. Returns the anon
 *  id ONLY on a valid match (the authorized transfer); a generic error otherwise. */
export async function recoverWithKey(
  inputKey: string,
): Promise<{ success: boolean; anonId?: string; error?: string }> {
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip")?.trim() ||
      "unknown";
    // Fails open on a Valkey outage — the key lookup below needs Valkey too,
    // so an outage can't be used to brute-force keys.
    const rl = await checkRateLimit(ip, "recover", RL_MAX, RL_WINDOW_MS);
    if (!rl.allowed) {
      return { success: false, error: "Too many attempts. Please try again later." };
    }

    const norm = normalizeRecoveryKey(inputKey);
    if (!isValidRecoveryKeyFormat(norm)) return { success: false, error: GENERIC_FAIL };

    const hash = hashRecoveryKey(norm, getPepper());
    const anonId = await redis.get(`${RECOVERY_PREFIX}${hash}`);
    if (!anonId || !ANON_RE.test(anonId)) return { success: false, error: GENERIC_FAIL };

    return { success: true, anonId };
  } catch (e) {
    console.error("recoverWithKey failed:", e);
    return { success: false, error: GENERIC_FAIL };
  }
}

/** Merge this browser's device notes into the recovered account, then discard
 *  the old device key. Called only after the user confirms. Note id collisions
 *  (astronomically unlikely) are reassigned so nothing is dropped. */
export async function mergeDeviceNotes(
  fromAnonId: string,
  toAnonId: string,
): Promise<{ success: boolean; moved?: number; error?: string }> {
  if (!ANON_RE.test(fromAnonId) || !ANON_RE.test(toAnonId)) {
    return { success: false, error: "Invalid device id" };
  }
  if (fromAnonId === toAnonId) return { success: true, moved: 0 };
  try {
    const fromNotes = await readAllNotes(fromAnonId);
    if (!fromNotes.length) return { success: true, moved: 0 };

    const toNotes = await readAllNotes(toAnonId);
    const toIds = new Set(toNotes.map((n) => n.id));
    const toWrite = fromNotes.map((n) => (toIds.has(n.id) ? { ...n, id: randomUUID() } : n));

    await putNotes(toAnonId, toWrite);
    await redis.del(`${NOTES_HASH_PREFIX}${fromAnonId}`); // discard the old device key
    return { success: true, moved: toWrite.length };
  } catch (e) {
    console.error("mergeDeviceNotes failed:", e);
    return { success: false, error: "Couldn't merge your device notes." };
  }
}
