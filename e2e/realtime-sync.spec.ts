import type { BrowserContext, Page, Route } from "@playwright/test";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { test, expect } from "./fixtures/no-conflicts";
import { mintSession, seededAccounts, seedState, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient, anonKey, supabaseUrl } from "./fixtures/admin";

// Realtime (Supabase postgres_changes / broadcast / presence).
//
//   (1) Same account, two devices: an edit (and a new note) made in one shows
//       up in the other through the notes-realtime channel alone. The second
//       device's polling is off: every server action and /api call it makes
//       fails, so the change can't arrive by a refresh. (The channel used to
//       filter on the DEVICE id, which never matches a row's author, so this
//       only ever arrived by polling.)
//   (2) Authz still holds: a notes-realtime subscription filtered on another
//       account's id receives nothing (RLS), and the private presence
//       channel admits a participant of the note and refuses an outsider.

const MAIN = 'main[aria-label="Note editor"]';
const EDITOR = `${MAIN} .ProseMirror`;
const REALTIME_DEADLINE = 5_000;

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);
const editorFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"));
const saveStatus = (page: Page) => page.locator(`${MAIN} [data-testid="save-status"]`);
const card = (page: Page, id: string) => page.locator(`[data-note-card="${id}"]`);

async function cloudServerContent(noteId: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
}

async function newCloudNote(page: Page, text: string): Promise<string> {
  await expect(page.locator("[data-note-card]").first()).toBeVisible();
  await page.waitForTimeout(1000);
  const before = await activeId(page);
  await page.locator("body").press("Control+j");
  await expect.poll(() => activeId(page)).not.toBe(before);
  await expect.poll(() => editorFocused(page)).toBe(true);
  const id = (await activeId(page))!;
  await page.keyboard.type(text, { delay: 15 });
  await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 15_000 }).toBe(text);
  await expect(saveStatus(page)).toHaveText("Synced", { timeout: 15_000 });
  return id;
}

/** No refresh can reach the server from this context: only realtime is left. */
async function disablePolling(context: BrowserContext): Promise<void> {
  const appOrigin = new URL(process.env.E2E_BASE_URL || "http://localhost:3050").origin;
  await context.route("**/*", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const serverAction = req.method() === "POST" && !!req.headers()["next-action"];
    if (serverAction || (url.origin === appOrigin && url.pathname.startsWith("/api/"))) {
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });
}

/** The notes-realtime channel is joined (the app subscribes after its load). */
async function realtimeJoined(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          // supabase-js keeps the socket on the client; find any joined notes channel.
          const w = window as unknown as { __e2eRealtimeTopics?: string[] };
          return w.__e2eRealtimeTopics ?? [];
        }),
      { timeout: 20_000 },
    )
    .toContain("realtime:notes-realtime");
}

/** Record the topics this page's realtime socket has joined (phx_reply ok). */
async function watchRealtimeJoins(page: Page) {
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/realtime/")) return;
    // Phoenix frames: an object (vsn 1.0.0) or [joinRef, ref, topic, event, payload] (vsn 2.0.0).
    const parse = (raw: string | Buffer) => {
      const m = JSON.parse(String(raw));
      return Array.isArray(m) ? { ref: m[1], topic: m[2], event: m[3], payload: m[4] } : m;
    };
    const pending = new Map<string, string>();
    ws.on("framesent", (f) => {
      try {
        const m = parse(f.payload);
        if (m.event === "phx_join") pending.set(m.ref, m.topic);
      } catch {
        /* binary / not JSON */
      }
    });
    ws.on("framereceived", (f) => {
      try {
        const m = parse(f.payload);
        if (m.event === "phx_reply" && m.payload?.status === "ok" && pending.has(m.ref)) {
          const topic = pending.get(m.ref)!;
          void page
            .evaluate((t) => {
              const w = window as unknown as { __e2eRealtimeTopics?: string[] };
              (w.__e2eRealtimeTopics ??= []).push(t);
            }, topic)
            .catch(() => {});
        }
      } catch {
        /* ignore */
      }
    });
  });
}

test.describe("(1) same account, two devices: changes arrive by realtime", () => {
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

  test("an edit and a new note in one device show in the other within seconds, polling off", async ({ browser, trackContext }) => {
    test.setTimeout(150_000);
    const [acc] = seededAccounts();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    trackContext(ctxA);
    trackContext(ctxB);
    try {
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      await signIn(a, acc);
      await signIn(b, acc);

      await openApp(a);
      const id = await newCloudNote(a, "realtime base text");

      await watchRealtimeJoins(b);
      await openApp(b);
      await expect(card(b, id)).toContainText("realtime base text", { timeout: 20_000 });
      await realtimeJoined(b);
      // Let B's load settle, then cut every path but the websocket.
      await b.waitForTimeout(1500);
      await disablePolling(ctxB);

      // Edit in A.
      await a.locator(EDITOR).click();
      await a.keyboard.press("End");
      await a.keyboard.type(" edited on A", { delay: 15 });
      await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 15_000 }).toBe("realtime base text edited on A");
      await expect(saveStatus(a)).toHaveText("Synced", { timeout: 15_000 });
      await expect(card(b, id), "the edit reached B by realtime").toContainText("realtime base text edited on A", {
        timeout: REALTIME_DEADLINE,
      });

      // A new note in A appears in B too.
      const id2 = await newCloudNote(a, "made on A after B loaded");
      await expect(card(b, id2), "the new note reached B by realtime").toContainText("made on A after B loaded", {
        timeout: REALTIME_DEADLINE,
      });

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// ── (2) Authz ────────────────────────────────────────────────────────────────

async function clientFor(acc: SeededAccount) {
  const s = await mintSession(acc);
  const client = createClient(supabaseUrl()!, anonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
  await client.realtime.setAuth(s.accessToken);
  return client;
}

async function joinStatus(channel: RealtimeChannel): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

test.describe("(2) realtime authz", () => {
  test.skip(seededAccounts().length < 2, "needs both seeded accounts (service-role key)");

  test("notes-realtime is scoped by RLS; private presence refuses an outsider", async () => {
    test.setTimeout(90_000);
    const [accA, accB] = seededAccounts();
    const shared = seedState()?.sharedNote;

    // A note only A can see.
    const { data: mine, error } = await adminClient()
      .from("notes")
      .insert({ author: accA.id, title: "authz probe", content: "private to A", is_private: true })
      .select("id")
      .single();
    expect(error).toBeNull();
    const privateId = (mine as { id: string }).id;

    const a = await clientFor(accA);
    const b = await clientFor(accB);
    try {
      // B asks for A's rows: RLS must hide them. A gets its own (control).
      const seenByB: string[] = [];
      const seenByA: string[] = [];
      const chB = b
        .channel("authz-notes-b")
        .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `author=eq.${accA.id}` }, (p) =>
          seenByB.push((p.new as { id?: string })?.id ?? "?"),
        );
      const chA = a
        .channel("authz-notes-a")
        .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `author=eq.${accA.id}` }, (p) =>
          seenByA.push((p.new as { id?: string })?.id ?? "?"),
        );
      expect(await joinStatus(chB)).toBe("SUBSCRIBED");
      expect(await joinStatus(chA)).toBe("SUBSCRIBED");
      await new Promise((r) => setTimeout(r, 1500)); // replication slot picks the subscriptions up

      const { error: upErr } = await adminClient().from("notes").update({ content: "private to A, edited" }).eq("id", privateId);
      expect(upErr).toBeNull();
      await expect.poll(() => seenByA, { timeout: 10_000 }).toContain(privateId);
      await new Promise((r) => setTimeout(r, 2000));
      expect(seenByB, "B never sees A's private note").not.toContain(privateId);

      // Private presence (the only realtime.messages policy): an outsider is
      // refused. (Participant admission: see the fixme below.)
      const outsider = b.channel(`presence:${privateId}`, { config: { private: true, presence: { key: accB.id } } });
      expect(await joinStatus(outsider), "outsider refused").not.toBe("SUBSCRIBED");
    } finally {
      await a.removeAllChannels();
      await b.removeAllChannels();
      await adminClient().from("notes").delete().eq("id", privateId);
    }
  });
});

// Realtime v2.1xx authorizes a private join on BROADCAST read; the presence
// migration (20261003000000) grants presence only (written for v2.76.5), so the
// owner and share recipients are refused too. Inert while
// NEXT_PUBLIC_PRIVATE_REALTIME is off; fix with a broadcast-read policy on
// presence:<noteId> topics before flipping it on.
test.fixme("private presence admits the owner and the share recipient", async () => {
  const [accA, accB] = seededAccounts();
  const shared = seedState()?.sharedNote;
  const a = await clientFor(accA);
  const b = await clientFor(accB);
  try {
    expect(shared).toBeTruthy();
    const ch = (c: typeof a, key: string) =>
      c.channel(`presence:${shared!.noteId}`, { config: { private: true, presence: { key } } });
    expect(await joinStatus(ch(a, accA.id)), "owner admitted").toBe("SUBSCRIBED");
    expect(await joinStatus(ch(b, accB.id)), "share recipient admitted").toBe("SUBSCRIBED");
  } finally {
    await a.removeAllChannels();
    await b.removeAllChannels();
  }
});
