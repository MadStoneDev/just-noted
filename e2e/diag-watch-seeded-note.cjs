// DIAGNOSTIC: log every change to the seeded A→B shared note while a full E2E
// run is going, so a corruption can be pinned to the test(s) running at that
// moment (match the times against the JSON reporter's test start / duration).
//
//   node e2e/diag-watch-seeded-note.cjs <repo root> <out.jsonl>
//
// Waits for e2e/.auth/seed.json (written by global-setup), follows a new run id
// if the seed is rewritten, and polls every 200 ms with the service-role client
// (test database only: env comes from .env.e2e via e2e/fixtures/env.ts).
// Logs: notes.title / content / version / updated_at / author, whether a
// note_ydoc row exists (and its updated_at), and the note_versions count.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[2] || ".");
const out = process.argv[3] || path.join(root, "test-results/diag-watch-seeded-note.jsonl");
const jiti = require(path.join(root, "node_modules/jiti"))(root + "/");
const { validateE2EEnv, e2eFileEnv } = jiti(path.join(root, "e2e/fixtures/env.ts"));
validateE2EEnv();
Object.assign(process.env, { ...e2eFileEnv(), ...process.env });
const { adminClient, SEED_FILE } = jiti(path.join(root, "e2e/fixtures/admin.ts"));
const seedFile = path.isAbsolute(SEED_FILE) ? SEED_FILE : path.join(root, SEED_FILE);

const write = (o) => fs.appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
let runId = null;
let noteId = null;
let last = "";

async function tick() {
  let seed = null;
  try {
    seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  } catch {}
  if (seed?.runId && seed.runId !== runId && seed.sharedNote) {
    runId = seed.runId;
    noteId = seed.sharedNote.noteId;
    last = "";
    write({ ev: "seed", runId, noteId, owner: seed.accounts?.[0]?.id });
  }
  if (!noteId) return;
  const db = adminClient();
  const [{ data: n }, { data: y }, { count }] = await Promise.all([
    db.from("notes").select("author, title, content, version, updated_at, deleted_at").eq("id", noteId).maybeSingle(),
    db.from("note_ydoc").select("updated_at").eq("note_id", noteId).maybeSingle(),
    db.from("note_versions").select("id", { count: "exact", head: true }).eq("note_id", noteId),
  ]);
  const snap = { note: n, ydocUpdatedAt: y?.updated_at ?? null, versions: count ?? 0 };
  const key = JSON.stringify(snap);
  if (key !== last) {
    last = key;
    write({ ev: n ? "change" : "gone", runId, ...snap });
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
write({ ev: "start", root });
setInterval(() => tick().catch((e) => write({ ev: "error", err: String(e?.message || e) })), 200);
