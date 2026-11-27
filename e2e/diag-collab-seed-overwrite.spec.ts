import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Page, Request } from "@playwright/test";
import * as Y from "yjs";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// DIAGNOSTIC (not part of the normal suite). In one full run (2026-11-27) the
// seeded A→B shared note ended up as only the B7 offline test's marker: the
// body "Shared with B for collaboration specs." was gone. The question: what
// wrote it, as which account, and through which path.
//
// Suspected path (no app change here, only measurement): when the owner opens a
// note shared with an editor, a sharing probe (getUsers) runs after the note is
// on screen. When it answers, the editor REMOUNTS in Yjs collab mode with an
// EMPTY doc. It fills the doc from note.content only after a 1 s grace timer,
// and only if the doc is still empty (milkdown-editor.tsx, seedTimer). Text
// typed before then makes the doc non-empty, the fill is skipped, and the
// content projection saves just the typed text over the body.
//
// Each iteration uses its own fresh note owned by A (so runs don't interfere),
// shared with B as an editor exactly like global-setup's seed, except the
// control, which is not shared. Variants:
//   b7-as-is        the B7 offline steps unchanged, no network shaping
//   b7-busy-server  the same, with the getUsers answer held 1 s (a busy server;
//                   still online), so collab mode starts ~1 s after the note
//                   is on screen and the offline typing lands in its grace window
//   online-grace    online; type the moment collab mode starts (/api/collab)
//   control         not shared (plain editor), B7 offline steps
//   load-fails      the note already has a Yjs doc (opened once and seeded);
//                   on the next open the doc load (/api/collab) fails, and the
//                   owner types the moment collab mode starts. Checks whether
//                   the stored doc itself (shared by every collaborator) is
//                   replaced, since saveCollabState upserts the full state.
//
//   E2E_DIAG=1 E2E_DIAG_REPEAT=5 npx playwright test e2e/diag-collab-seed-overwrite.spec.ts
//
// One JSON line per iteration goes to $E2E_DIAG_OUT/<variant>.jsonl (default
// test-results/diag-collab-seed, which the next Playwright run clears).

test.skip(!process.env.E2E_DIAG, "diagnostic; set E2E_DIAG=1");
test.skip(() => seededAccounts().length < 2, "needs 2 seeded accounts");

const REPEAT = Number(process.env.E2E_DIAG_REPEAT || 1);
const OUT = process.env.E2E_DIAG_OUT ?? "test-results/diag-collab-seed";
const BODY = "Shared with B for collaboration specs.";
const editor = (p: Page) => p.locator(".ProseMirror").first();

type Variant = "b7-as-is" | "b7-busy-server" | "online-grace" | "control" | "load-fails";

async function makeNote(ownerId: string, readerId: string, readerHandle: string, share: boolean) {
  const db = adminClient();
  // Same shape as global-setup's seeded note (content_format left to the default).
  const title = `diag-collab ${crypto.randomBytes(3).toString("hex")}`;
  const { data: note, error } = await db.from("notes").insert({ author: ownerId, title, content: BODY }).select("id").single();
  if (error || !note) throw new Error(`note: ${error?.message}`);
  if (share) {
    const shortcode = Array.from(crypto.randomBytes(9), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"[n % 52]).join("");
    const { data: s, error: sErr } = await db
      .from("shared_notes")
      .insert({ note_id: note.id, note_owner_id: ownerId, shortcode, is_public: false, is_anonymous: false, storage: "supabase", link_permission: "view" })
      .select("id")
      .single();
    if (sErr || !s) throw new Error(`share: ${sErr?.message}`);
    const { error: rErr } = await db.from("shared_notes_readers").insert({ shared_note: s.id, reader_id: readerId, reader_username: readerHandle, role: "edit" });
    if (rErr) throw new Error(`reader: ${rErr.message}`);
  }
  return { id: note.id as string, title };
}

// The visible text of a stored Yjs doc (milkdown's collab fragment).
function ydocText(b64: string): string {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Uint8Array.from(Buffer.from(b64, "base64")));
    return doc.getXmlFragment("prosemirror").toString().replace(/<[^>]+>/g, "");
  } catch (e) {
    return `undecodable: ${String(e)}`;
  }
}

async function server(id: string) {
  const db = adminClient();
  const { data: n } = await db.from("notes").select("author, title, content, version").eq("id", id).maybeSingle();
  const { data: y } = await db.from("note_ydoc").select("state, updated_at").eq("note_id", id).maybeSingle();
  const { data: v } = await db.from("note_versions").select("author, content, reason, note_version, created_at").eq("note_id", id).order("created_at");
  return { note: n, ydoc: !!y, ydocText: y ? ydocText((y as any).state) : null, versions: v ?? [] };
}

for (const variant of ["b7-as-is", "b7-busy-server", "online-grace", "control", "load-fails"] as Variant[]) {
  for (let i = 0; i < REPEAT; i++) {
    test(`${variant} #${i + 1}`, async ({ page, context }) => {
      test.setTimeout(90_000);
      const [a, b] = seededAccounts();
      const { id, title } = await makeNote(a.id, b.id, b.handle, variant !== "control");
      const t0 = Date.now();
      const t = () => Date.now() - t0;
      const events: Record<string, unknown>[] = [];
      const log = (e: Record<string, unknown>) => events.push({ t: t(), ...e });

      // Every request that concerns this note: server actions (by body), the
      // collab load / save, and their outcome.
      const tag = (r: Request) => {
        const body = r.postData() ?? "";
        const u = new URL(r.url());
        const action = r.headers()["next-action"];
        if (u.pathname.startsWith("/api/collab")) return `collab-load ${u.search.includes(id) ? "this" : "other"}`;
        if (!action || !body.includes(id)) return null;
        const op = body.match(/"operation":"(\w+)"/)?.[1];
        const kind = op ?? (body.includes("ydoc") || /"state":"/.test(body) ? "collab-save" : "action");
        return `${kind}${body.includes('"projection":true') ? " projection" : ""}${body.includes("diag-mark-") ? " +marker" : ""}${body.includes(BODY) ? " +body" : ""}`;
      };
      page.on("request", (r) => { const k = tag(r); if (k) log({ ev: "req", k }); });
      page.on("requestfinished", async (r) => { const k = tag(r); if (k) log({ ev: "done", k, status: (await r.response())?.status() }); });
      page.on("requestfailed", (r) => { const k = tag(r); if (k) log({ ev: "fail", k, err: r.failure()?.errorText }); });

      if (variant === "b7-busy-server") {
        await page.route("**/*", async (route) => {
          const r = route.request();
          const body = r.postData() ?? "";
          if (r.method() === "POST" && r.headers()["next-action"] && body.includes('"getUsers"') && body.includes(id)) {
            log({ ev: "hold getUsers 1000ms" });
            await new Promise((res) => setTimeout(res, 1000));
          }
          await route.continue().catch(() => {});
        });
      }
      const collabLoad = page.waitForRequest((r) => r.url().includes("/api/collab") && r.url().includes(id), { timeout: 20_000 }).then(() => log({ ev: "collab mode (load sent)" })).catch(() => {});

      await signIn(page, a);
      if (variant === "load-fails") {
        // First open: online, let the doc seed from note.content and persist.
        const first = await context.newPage();
        await first.goto("/");
        await first.locator(`[data-note-card="${id}"]`).click();
        await expect.poll(async () => (await server(id)).ydocText ?? "", { timeout: 20_000 }).toContain("Shared with B");
        await first.close();
        log({ ev: "doc seeded and stored", ydocText: (await server(id)).ydocText });
        await page.route("**/api/collab**", (route) => { log({ ev: "abort /api/collab" }); return route.abort(); });
      }
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
      await page.locator(`[data-note-card="${id}"]`).click();
      await expect(editor(page)).toContainText("Shared with B");
      log({ ev: "opened", editor: await editor(page).innerText() });
      const marker = `diag-mark-${Date.now()}`;

      if (variant === "online-grace" || variant === "load-fails") {
        await collabLoad; // the editor just remounted on an empty Yjs doc
        await editor(page).click();
        await page.keyboard.press("End");
        log({ ev: "typing", editor: await editor(page).innerText() });
        await page.keyboard.type(` ${marker}`);
      } else {
        // core-flows.spec.ts "offline: switching is refused…", minus the switch.
        await page.waitForTimeout(1500);
        log({ ev: "offline", editor: await editor(page).innerText() });
        await context.setOffline(true);
        await editor(page).click();
        await page.keyboard.press("End");
        log({ ev: "typing", editor: await editor(page).innerText() });
        await page.keyboard.type(` ${marker}`);
        await page.waitForTimeout(1500);
        log({ ev: "online", editor: await editor(page).innerText() });
        await context.setOffline(false);
      }
      await expect.poll(async () => (await server(id)).note?.content ?? "", { timeout: 20_000 }).toContain(marker);
      await page.waitForTimeout(4000); // let collab persist / later projections land
      const end = await server(id);
      const result = {
        variant,
        iter: i + 1,
        noteId: id,
        title,
        account: a.label,
        lostBody: !(end.note?.content ?? "").includes(BODY),
        finalContent: end.note?.content,
        finalTitle: end.note?.title,
        finalAuthorIsA: end.note?.author === a.id,
        version: end.note?.version,
        ydoc: end.ydoc,
        ydocText: end.ydocText,
        lostBodyInDoc: end.ydocText !== null && !end.ydocText.includes(BODY),
        versions: end.versions.map((v) => ({ ...v, content: (v.content ?? "").slice(0, 80) })),
        editorAtEnd: await editor(page).innerText(),
        events,
      };
      fs.mkdirSync(OUT, { recursive: true });
      fs.appendFileSync(path.join(OUT, `${variant}.jsonl`), JSON.stringify(result) + "\n");
      console.log(`[diag-collab] ${variant} #${i + 1}: lostBody=${result.lostBody} ydoc=${result.ydoc} ydocText=${JSON.stringify(result.ydocText)} content=${JSON.stringify(result.finalContent)}`);
      await adminClient().from("notes").delete().eq("id", id);
    });
  }
}
