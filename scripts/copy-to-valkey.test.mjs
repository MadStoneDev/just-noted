// Tests for scripts/copy-to-valkey.mjs.
//
// Unit tests (decideNoteField) always run with `npx vitest run`.
//
// The integration tests run the real CLI against two THROWAWAY local Valkeys
// and FLUSH both. They are skipped unless both URLs are set, and refuse
// anything that isn't localhost:
//
//   docker run -d --rm --name copytest-src -p 6392:6379 valkey/valkey:8
//   docker run -d --rm --name copytest-dst -p 6393:6379 valkey/valkey:8
//   COPY_TEST_SOURCE_URL=redis://127.0.0.1:6392 COPY_TEST_VALKEY_URL=redis://127.0.0.1:6393 \
//     npx vitest run scripts/copy-to-valkey.test.mjs
//   docker stop copytest-src copytest-dst

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import Redis from "ioredis";
import { decideNoteField, MERGE_LUA } from "./copy-to-valkey.mjs";

const note = (o) => JSON.stringify({ id: "n", title: "t", content: "c", ...o });

describe("decideNoteField", () => {
  it("byte-identical copies are the same", () => {
    expect(decideNoteField(note({ version: 2 }), note({ version: 2 })).action).toBe("same");
  });
  it("source with a higher version replaces Valkey's", () => {
    expect(decideNoteField(note({ version: 3, content: "new" }), note({ version: 2 })).action).toBe("replace");
  });
  it("Valkey with a higher version is kept", () => {
    expect(decideNoteField(note({ version: 2 }), note({ version: 5, content: "newer" })).action).toBe("keep");
  });
  it("missing version counts as 1, like the app", () => {
    expect(decideNoteField(note({ version: 2 }), note({})).action).toBe("replace");
    expect(decideNoteField(note({}), note({ version: 2 })).action).toBe("keep");
  });
  it("same version, different content is a conflict (nothing chosen)", () => {
    const r = decideNoteField(note({ version: 4, content: "a" }), note({ version: 4, content: "b" }));
    expect(r.action).toBe("conflict");
    expect(r.reason).toMatch(/same version 4/);
  });
  it("same version, different title is a conflict", () => {
    expect(decideNoteField(note({ version: 4, title: "x" }), note({ version: 4, title: "y" })).action).toBe("conflict");
  });
  it("same version, only metadata differs: Valkey kept, no conflict", () => {
    expect(decideNoteField(note({ version: 4, order: 1 }), note({ version: 4, order: 7 })).action).toBe("keep");
  });
  it("unparseable or non-note values are conflicts", () => {
    expect(decideNoteField("{oops", note({})).action).toBe("conflict");
    expect(decideNoteField("42", note({})).action).toBe("conflict");
    expect(decideNoteField(note({ version: "x" }), note({ version: 1 })).action).toBe("conflict");
  });
  it("accepts Buffers", () => {
    expect(decideNoteField(Buffer.from(note({ version: 2 })), Buffer.from(note({ version: 1 }))).action).toBe("replace");
  });
});

// ── Integration ──────────────────────────────────────────────────────────────

const SRC_URL = process.env.COPY_TEST_SOURCE_URL;
const DST_URL = process.env.COPY_TEST_VALKEY_URL;
const isLocal = (u) => /^redis:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(u ?? "");
const SCRIPT = fileURLToPath(new URL("./copy-to-valkey.mjs", import.meta.url));
const P = "justnoted:";

function runCopy(...args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env: { ...process.env, SOURCE_REDIS_URL: SRC_URL, VALKEY_URL: DST_URL } },
      (err, stdout, stderr) => {
        const json = stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1);
        resolve({ code: err ? err.code : 0, stdout, stderr, stats: json ? JSON.parse(json) : null });
      },
    );
  });
}

describe.skipIf(!SRC_URL || !DST_URL)("copy-to-valkey CLI (throwaway Valkeys)", () => {
  let src;
  let dst;
  const n = (id, version, content, extra = {}) =>
    JSON.stringify({ id, title: `title-${id}`, content, version, ...extra });

  beforeAll(async () => {
    if (!isLocal(SRC_URL) || !isLocal(DST_URL) || SRC_URL === DST_URL) {
      throw new Error("COPY_TEST_* must be two different redis://127.0.0.1 or redis://localhost URLs (they get flushed).");
    }
    src = new Redis(SRC_URL);
    dst = new Redis(DST_URL);
  });
  afterAll(() => {
    src?.disconnect();
    dst?.disconnect();
  });
  beforeEach(async () => {
    await src.flushall();
    await dst.flushall();
  });

  it("pass 1 copies everything into an empty Valkey; a dry run writes nothing", async () => {
    await src.hset("notes:u1", "a", n("a", 1, "alpha"), "b", n("b", 1, "beta"));
    await src.set("recovery:h1", "dev1");

    const dry = await runCopy();
    expect(dry.code).toBe(0);
    expect(dry.stats.hashes.created).toBe(1);
    expect(await dst.dbsize()).toBe(0);

    const app = await runCopy("--apply");
    expect(app.code).toBe(0);
    expect(app.stats.hashes).toMatchObject({ created: 1, fieldsAdded: 2, fieldsReplacedWithNewer: 0 });
    expect(app.stats.strings.copied).toBe(1);
    expect(await dst.hget(`${P}notes:u1`, "a")).toBe(n("a", 1, "alpha"));
    expect(await dst.get(`${P}recovery:h1`)).toBe("dev1");
  });

  it("pass 2: newer source versions replace, newer Valkey versions stay, equal-version edits conflict", async () => {
    // State after pass 1 + deploy + new-build edits (Valkey), and old-build edits between the passes (source).
    await dst.hset(`${P}notes:u1`, {
      edited_old: n("edited_old", 1, "pass-1 copy"), // edited on the old build after pass 1
      edited_new: n("edited_new", 3, "new build edit"), // edited on the new build after the deploy
      both: n("both", 2, "SECRET-VALKEY-TEXT"), // edited on both sides from the same version
      reorder: n("reorder", 2, "same", { order: 9 }), // only reordered on the old build
      identical: n("identical", 1, "same"),
      deleted_old: n("deleted_old", 1, "gone on old build"), // deleted on the old build after pass 1
    });
    await dst.set(`${P}notes_rev:u1`, "10");
    await src.hset("notes:u1", {
      edited_old: n("edited_old", 2, "old build edit"),
      edited_new: n("edited_new", 1, "pass-1 copy"),
      both: n("both", 2, "SECRET-SOURCE-TEXT"),
      reorder: n("reorder", 2, "same", { order: 1 }),
      identical: n("identical", 1, "same"),
      created_old: n("created_old", 1, "created on old build"),
    });
    // A non-notes hash keeps Valkey's field even if the source differs.
    await src.hset("other:x", "f", "src");
    await dst.hset(`${P}other:x`, "f", "dst");

    const before = await dst.hgetall(`${P}notes:u1`);
    const dry = await runCopy();
    expect(dry.code).toBe(2); // the conflict
    expect(dry.stats.hashes).toMatchObject({ fieldsAdded: 1, fieldsReplacedWithNewer: 1, fieldConflicts: 1 });
    expect(await dst.hgetall(`${P}notes:u1`)).toEqual(before); // dry run wrote nothing

    const app = await runCopy("--apply");
    expect(app.code).toBe(2);
    expect(app.stats.hashes).toMatchObject({
      merged: 1,
      fieldsAdded: 1,
      fieldsReplacedWithNewer: 1,
      fieldConflicts: 1,
    });
    const after = await dst.hgetall(`${P}notes:u1`);
    expect(after.edited_old).toBe(n("edited_old", 2, "old build edit")); // newer source wins
    expect(after.edited_new).toBe(n("edited_new", 3, "new build edit")); // newer Valkey stays
    expect(after.both).toBe(n("both", 2, "SECRET-VALKEY-TEXT")); // conflict: nothing chosen, Valkey stays
    expect(after.reorder).toBe(n("reorder", 2, "same", { order: 9 })); // metadata-only: Valkey stays
    expect(after.identical).toBe(n("identical", 1, "same"));
    expect(after.created_old).toBe(n("created_old", 1, "created on old build")); // added
    expect(after.deleted_old).toBeDefined(); // deletions are not copied (accepted)
    expect(await dst.hget(`${P}other:x`, "f")).toBe("dst");
    expect(await dst.get(`${P}notes_rev:u1`)).toBe("11"); // bumped once

    // The conflict names the key and note id, never the content.
    expect(app.stderr).toMatch(/conflict: notes:u1 note both \(same version 2/);
    for (const out of [app.stdout, app.stderr, dry.stdout, dry.stderr]) {
      expect(out).not.toMatch(/SECRET-/);
    }

    // Re-run: only the standing conflict remains; nothing else to do.
    const again = await runCopy("--apply");
    expect(again.stats.hashes).toMatchObject({ fieldsAdded: 0, fieldsReplacedWithNewer: 0, fieldConflicts: 1 });
    expect(await dst.get(`${P}notes_rev:u1`)).toBe("11");
  });

  it("legacy note arrays in the source merge into an existing hash by the same rules", async () => {
    await dst.hset(`${P}notes:u2`, "a", n("a", 1, "old"));
    await src.set("notes:u2", JSON.stringify([JSON.parse(n("a", 2, "newer")), JSON.parse(n("b", 1, "new note"))]));
    const app = await runCopy("--apply");
    expect(app.code).toBe(0);
    expect(app.stats.legacyArraysMergedIntoHash).toBe(1);
    expect(await dst.hget(`${P}notes:u2`, "a")).toBe(n("a", 2, "newer"));
    expect(await dst.hget(`${P}notes:u2`, "b")).toBe(n("b", 1, "new note"));
  });

  it("MERGE_LUA's compare-and-set refuses a field that changed after it was read", async () => {
    await dst.hset("t", "f", "app-wrote-this");
    const res = await dst.eval(MERGE_LUA, 1, "t", "0", "0", "f", "what-we-read", "source-copy");
    expect(res).toEqual([1, 0, 0, "f"]);
    expect(await dst.hget("t", "f")).toBe("app-wrote-this");
  });
});
