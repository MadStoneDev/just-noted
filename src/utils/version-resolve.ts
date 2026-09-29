// Pure decision logic for Phase 2 optimistic-concurrency writes. Kept
// side-effect-free so it can be unit-tested; the server actions carry out the
// actual DB writes. See supabaseActions / redis note ops / sharing.
//
// IMPORTANT: correctness is decided by VERSION, never by timestamps — a wrong
// device clock can no longer flip who wins.

export type WriteMode =
  | "cas" // normal write: compare-and-set on version
  | "projection" // Yjs-merged content projection: no conflict, just bump
  | "legacy"; // version-less write from an old client / pre-upgrade queue op

export type WriteDecision =
  | { kind: "apply"; nextVersion: number; snapshotPrior: boolean }
  | { kind: "conflict"; serverVersion: number };

/**
 * Decide how to treat an incoming write.
 * - projection: always apply, bump version, no history snapshot (Yjs is source
 *   of truth and content is a convergent projection).
 * - legacy: always apply, bump version, snapshot prior content to history first
 *   (we can't verify staleness, so we preserve what we're about to overwrite).
 * - cas: apply only when the client's base version matches the server's current
 *   version; otherwise it's a conflict (stale write).
 */
export function resolveWrite(params: {
  mode: WriteMode;
  baseVersion: number | null | undefined;
  serverVersion: number;
}): WriteDecision {
  const { mode, baseVersion, serverVersion } = params;

  if (mode === "projection") {
    return { kind: "apply", nextVersion: serverVersion + 1, snapshotPrior: false };
  }
  if (mode === "legacy") {
    return { kind: "apply", nextVersion: serverVersion + 1, snapshotPrior: true };
  }
  // cas
  if (typeof baseVersion !== "number") {
    // A CAS write with no base can't be verified — treat as a conflict rather
    // than risk clobbering. (Callers use "legacy" mode for intentional
    // version-less writes.)
    return { kind: "conflict", serverVersion };
  }
  if (baseVersion === serverVersion) {
    return { kind: "apply", nextVersion: serverVersion + 1, snapshotPrior: false };
  }
  return { kind: "conflict", serverVersion };
}
