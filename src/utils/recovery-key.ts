import crypto from "crypto";

// A separate, high-entropy recovery key for guest ("Local") notes. It is NOT
// the anonymous id (which is the Redis key name / sent in requests) — only a
// SHA-256(pepper + key) hash is stored server-side, mapped to the anon id.
//
// 31-char unambiguous alphabet (no 0/O/1/I/L). 25 chars ≈ 124 bits of entropy.
export const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_KEY_CHARS = 25;
const GROUP = 5;

/** Generate a formatted recovery key, e.g. JN7Q4-KXMP2-VD9TR-AHC6W-… (5×5). */
export function generateRecoveryKey(): string {
  const n = RECOVERY_ALPHABET.length;
  // Rejection-sample to avoid modulo bias.
  const ceiling = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < RECOVERY_KEY_CHARS) {
    const buf = crypto.randomBytes(RECOVERY_KEY_CHARS);
    for (let i = 0; i < buf.length && out.length < RECOVERY_KEY_CHARS; i++) {
      if (buf[i] < ceiling) out += RECOVERY_ALPHABET[buf[i] % n];
    }
  }
  return out.match(new RegExp(`.{1,${GROUP}}`, "g"))!.join("-");
}

/** Uppercase, strip anything not in the alphabet (dashes/spaces/typos removed). */
export function normalizeRecoveryKey(input: string): string {
  const up = (input || "").toUpperCase();
  let out = "";
  for (const c of up) if (RECOVERY_ALPHABET.includes(c)) out += c;
  return out;
}

export function isValidRecoveryKeyFormat(normalized: string): boolean {
  return normalized.length === RECOVERY_KEY_CHARS;
}

/** SHA-256 of pepper + normalized key. High entropy, so a fast hash is fine. */
export function hashRecoveryKey(normalizedKey: string, pepper: string): string {
  return crypto.createHash("sha256").update(`${pepper}:${normalizedKey}`).digest("hex");
}
