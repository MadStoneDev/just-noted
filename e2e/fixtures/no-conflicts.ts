import { test as base, type BrowserContext } from "@playwright/test";
import Redis from "ioredis";
import { adminClient, hasAdminEnv } from "./admin";
import { seededAccounts } from "./auth";
import { e2eFileEnv } from "./env";

// Every sync / round-trip test must end with NO "(conflicted copy)" notes it
// didn't ask for. A copy means two writers raced on one note (or a save went
// out on a stale base) — text-level assertions on the main note can't see it,
// because the main note usually still ends up right.
//
// Import `test` / `expect` from here instead of @playwright/test. The check is
// automatic:
//   - guest (Redis) notes: the anonymous ids this test's server actions used
//     are collected from the default `context`; their hashes are checked after
//     the test. A test that opens its own context (launchPersistentContext,
//     browser.newContext) must register it with `trackContext(ctx)`.
//   - cloud notes: for every seeded account the test signed in as (signIn
//     records it), conflicted copies are compared before and after the test.
// A test that EXPECTS a copy (a genuine two-device edit) opts out with
// `allowConflictedCopies()`.

const KEY_PREFIX = "justnoted:";
const COPY_MARK = "(conflicted copy";
const USER_ID_RE = /"userId":"([0-9a-fA-F-]{36})"/g;

function valkeyUrl(): string {
  return e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380";
}

async function guestCopies(redis: Redis, anonIds: Iterable<string>): Promise<string[]> {
  const found: string[] = [];
  for (const id of anonIds) {
    let all: Record<string, string> = {};
    try {
      // Legacy array keys can't hold a copy field; WRONGTYPE just means "none".
      all = await redis.hgetall(`notes:${id}`);
    } catch {
      continue;
    }
    for (const raw of Object.values(all)) {
      try {
        const n = JSON.parse(raw);
        if (String(n.title ?? "").includes(COPY_MARK)) {
          found.push(`guest ${id.slice(0, 8)}…: "${n.title}" — ${JSON.stringify(String(n.content ?? "").slice(0, 80))}`);
        }
      } catch {
        /* not a note */
      }
    }
  }
  return found;
}

async function cloudCopies(only?: Set<string>): Promise<Map<string, { id: string; title: string; content: string }[]>> {
  const byAccount = new Map<string, { id: string; title: string; content: string }[]>();
  if (!hasAdminEnv()) return byAccount;
  for (const acc of seededAccounts()) {
    if (only && !only.has(acc.id)) continue;
    const { data } = await adminClient()
      .from("notes")
      .select("id, title, content")
      .eq("author", acc.id)
      .ilike("title", `%${COPY_MARK}%`);
    byAccount.set(acc.label, (data ?? []) as { id: string; title: string; content: string }[]);
  }
  return byAccount;
}

export const test = base.extend<{
  trackContext: (ctx: BrowserContext) => void;
  allowConflictedCopies: () => void;
  _noConflictedCopies: void;
}>({
  _noConflictedCopies: [
    async ({ context }, use, testInfo) => {
      const anonIds = new Set<string>();
      const watch = (ctx: BrowserContext) => {
        ctx.on("request", (req) => {
          if (req.method() !== "POST" || !req.headers()["next-action"]) return;
          for (const m of (req.postData() ?? "").matchAll(USER_ID_RE)) anonIds.add(m[1]);
        });
      };
      watch(context);
      (testInfo as any)._watchContext = watch;
      (testInfo as any)._allowCopies = false;
      (testInfo as any)._signedIn = new Set<string>();
      const cloudBefore = await cloudCopies();

      await use();

      if ((testInfo as any)._allowCopies) return;
      const created: string[] = [];
      const redis = new Redis(valkeyUrl(), { keyPrefix: KEY_PREFIX, lazyConnect: true, maxRetriesPerRequest: 1 });
      try {
        if (anonIds.size) created.push(...(await guestCopies(redis, anonIds)));
      } finally {
        redis.disconnect();
      }
      const signedIn: Set<string> = (testInfo as any)._signedIn;
      const cloudAfter = signedIn.size ? await cloudCopies(signedIn) : new Map();
      for (const [label, after] of cloudAfter) {
        const before = new Set((cloudBefore.get(label) ?? []).map((n) => n.id));
        for (const n of after) {
          if (!before.has(n.id)) created.push(`cloud ${label}: "${n.title}" — ${JSON.stringify(String(n.content ?? "").slice(0, 80))}`);
        }
      }
      if (created.length) {
        throw new Error(
          `This test created ${created.length} conflicted cop${created.length === 1 ? "y" : "ies"} ` +
            `(two writers raced on one note, or a save used a stale base):\n  ${created.join("\n  ")}`,
        );
      }
    },
    { auto: true },
  ],
  trackContext: async ({ _noConflictedCopies }, use, testInfo) => {
    void _noConflictedCopies;
    await use((ctx) => (testInfo as any)._watchContext(ctx));
  },
  allowConflictedCopies: async ({}, use, testInfo) => {
    await use(() => {
      (testInfo as any)._allowCopies = true;
    });
  },
});

export { expect } from "@playwright/test";
