import { test, expect, chromium, type Page } from "@playwright/test";
import { seedState, seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Core flows for the Ready-for-mobile gate (docs/mobile-readiness.md).
//
// Status:
// - Local (anonymous) flows are implemented. A clean context opens the notes app
//   with NO note open, so the editor (`.ProseMirror`) mounts only after a note is
//   created. Even "local" notes are Redis-backed server-side, so these need
//   runtime env to pass.
// - Cloud and B7 flows run signed in as the accounts global-setup seeds (needs
//   the service-role key in .env.local; they skip without it). See
//   fixtures/auth.ts for how the session is minted and injected.
// - The remaining flows stay `test.fixme` until their selectors are verified.

const EDITOR = ".ProseMirror"; // Milkdown's ProseMirror surface (contenteditable)
const NOTE_ROW = "[data-note-card]"; // one sidebar note card (carries the note id)

// The sidebar's note-count footer ("0 notes" / "1 note"), a reliable, visible
// signal for whether a note is in the list.
const noteCount = (page: Page) => page.getByText(/^\d+ notes?$/);

// Parse the numeric note count out of the footer ("3 notes" → 3). Returns 0 when
// the footer isn't present yet.
async function readNoteCount(page: Page): Promise<number> {
  try {
    const t = await noteCount(page).first().innerText({ timeout: 5000 });
    return parseInt(t.match(/\d+/)?.[0] ?? "0", 10);
  } catch {
    return 0;
  }
}

// Wait for the notes app shell to be ready (so actions have a mounted target).
async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
}

// Create the first note. On a clean load the main editor region shows an empty
// state with its own "New note" button — unambiguous (the rail's icon button has
// the same name), and clicking it mounts the editor.
async function createFirstNote(page: Page): Promise<void> {
  await page
    .getByRole("main", { name: "Note editor" })
    .getByRole("button", { name: "New note" })
    .click();
  await expect(page.locator(EDITOR).first()).toBeVisible();
}

function editor(page: Page) {
  return page.locator(EDITOR).first();
}

test.describe("notes — local (Redis, anonymous)", () => {
  test("create, edit, reload → content persists", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await createFirstNote(page);
    const marker = `e2e-local-${Date.now()}`;
    await editor(page).click();
    await page.keyboard.type(marker);
    await expect(editor(page)).toContainText(marker);

    // Let the content autosave persist (debounce + round-trip) before reloading.
    await page.waitForTimeout(3000);
    await page.reload();
    await waitForApp(page);

    // The most-recent note is auto-opened after reload; assert its content survived.
    await expect(editor(page)).toContainText(marker, { timeout: 20_000 });
  });

  // Acceptance test for B8 (a new note must appear in the sidebar immediately,
  // without selecting another note first). D13 is the related keystroke-lag
  // symptom, fixed by id-scoped/shallow store selectors + memoised list rows
  // (NoteCard). NOTE: the originally-reported B8 bug was observed SIGNED IN
  // (cloud notes); this anonymous/local case did not reproduce it on its own.
  // The signed-in variant lives in the cloud describe block below and is the
  // one that exercises the reported path (runs once E2E_ACCOUNTS is set).
  test("new note appears in the sidebar immediately (B8) — local", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await expect(noteCount(page)).toHaveText("0 notes");
    await createFirstNote(page);
    await expect(noteCount(page)).toHaveText("1 note");
  });

  // E1 acceptance: keyboard note switching lands in the target note's editor with
  // the caret at the end, ready to type — and opening it is NOT an edit (no
  // "Saving…", per "open never edits"). The target ends in a list on purpose:
  // that's the shape where Milkdown's trailing-paragraph plugin could turn a
  // caret placement into a doc change.
  test("keyboard switch focuses the editor at the end, without an edit (E1)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    // Note A — ends in a bullet list.
    await createFirstNote(page);
    const aId = await activeCardId(page);
    await page.keyboard.type("- alpha item");
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("alpha item");

    // Note B — plain paragraph; focus ends up in B's editor.
    await page.keyboard.press("Control+j");
    await expect(noteCount(page)).toHaveText("2 notes");
    const bId = await activeCardId(page);
    await page.keyboard.type("bravo paragraph");
    await expect(page.locator(`[data-note-card="${bId}"]`)).toContainText("bravo paragraph");
    await page.waitForTimeout(2500); // let B's cloud debounce settle first

    // Watch the editor's status for any "Saving…" from here on.
    await page.evaluate(() => {
      (window as any).__sawSaving = false;
      new MutationObserver(() => {
        if (/Saving/.test(document.getElementById("main-content")?.textContent ?? "")) {
          (window as any).__sawSaving = true;
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });

    // Jump to A by its sidebar position (Ctrl+Alt+N).
    const ids = await page.locator(NOTE_ROW).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-note-card")),
    );
    await page.keyboard.press(`Control+Alt+${ids.indexOf(aId) + 1}`);
    await expect(editor(page)).toContainText("alpha item");
    expect(await activeCardId(page)).toBe(aId);

    // Focus is in the editor body…
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")))
      .toBe(true);
    // …and opening it was not an edit.
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => (window as any).__sawSaving)).toBe(false);

    // Caret at the end: typing appends to the last list item straight away.
    await page.keyboard.type(" end");
    await expect(editor(page).locator("li").last()).toHaveText("alpha item end");

    // The switch shortcut must not also run Milkdown's Mod-Alt-N block command
    // on the note being left (it used to save B as "## bravo paragraph").
    const order = await page.locator(NOTE_ROW).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-note-card")),
    );
    await page.keyboard.press(`Control+Alt+${order.indexOf(bId) + 1}`);
    await expect(editor(page)).toContainText("bravo paragraph");
    await expect(editor(page).locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
    await expect(editor(page).locator("p", { hasText: "bravo paragraph" })).toHaveCount(1);
    // …and A is still a list (leaving it didn't convert it either).
    await page.keyboard.press(`Control+Alt+${order.indexOf(aId) + 1}`);
    await expect(editor(page).locator("li").last()).toHaveText("alpha item end");
  });

  // Data-loss regression: the editor debounces change emission (~300ms across
  // Milkdown's listener + LazyTextBlock). Leaving a note inside that window —
  // here Ctrl+J straight after typing — used to drop the last keystrokes (a
  // freshly-typed note came back "Empty note"). The unmount path now flushes.
  test("text typed just before leaving a note is kept (fast Ctrl+J)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    const aId = await activeCardId(page);
    await page.keyboard.type("quick words");
    await page.keyboard.press("Control+j"); // no wait — inside the debounce window
    await expect(noteCount(page)).toHaveText("2 notes");
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("quick words");

    await page.waitForTimeout(3000); // let the save land
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("quick words", {
      timeout: 20_000,
    });
  });

  // Data-loss guard for closing the tab straight after typing: the last
  // keystrokes are still inside the editor's ~300ms debounce and the 0.5s local
  // persist, so only the pagehide/visibilitychange flush can save them (IDB copy
  // + offline-queue entry). A SECOND app tab stays open throughout: when it
  // refreshes it must keep (and push) the closed tab's text, not overwrite it
  // with its own stale copy. Then a full browser restart must still show it.
  // Uses a persistent profile so IndexedDB/localStorage (and the guest
  // identity) survive the restart, not just a page reload.
  test("text typed just before closing the tab is kept (pagehide, second tab)", async ({ baseURL }, testInfo) => {
    test.slow();
    const userDataDir = testInfo.outputPath("profile");
    const launch = () => chromium.launchPersistentContext(userDataDir, { baseURL });

    let ctx = await launch();
    try {
      // The other tab hears the closing tab's pagehide over a BroadcastChannel,
      // proving the close really ran the unload path.
      await ctx.addInitScript(() => {
        window.addEventListener("pagehide", () => {
          new BroadcastChannel("e2e").postMessage("pagehide");
        });
      });
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto("/");
      await waitForApp(page);
      await createFirstNote(page);
      const id = await activeCardId(page);
      // Let the create land so the note itself exists; only the text is at risk.
      await page.waitForTimeout(2500);

      // Second app tab, loaded now — so it holds the note WITHOUT the text.
      const other = await ctx.newPage();
      await other.goto("/");
      await waitForApp(other);
      const otherCard = other.locator(`[data-note-card="${id}"]`);
      await expect(otherCard).toBeVisible();
      const heard = other.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const ch = new BroadcastChannel("e2e");
            ch.onmessage = (e) => resolve(String(e.data));
          }),
      );

      const marker = `e2e-close-${Date.now()}`;
      await page.bringToFront();
      await editor(page).click();
      await page.keyboard.type(marker);
      await page.close({ runBeforeUnload: true }); // no wait — inside the debounce
      expect(await heard).toBe("pagehide");
      await expect(otherCard).not.toContainText(marker); // nothing synced yet

      // Case 1: the other tab refreshes (focus → full refresh; past the 5s
      // min-refresh gap since it loaded). It must keep the closed tab's text.
      await other.bringToFront();
      await other.waitForTimeout(5500);
      await other.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(otherCard).toContainText(marker, { timeout: 20_000 });

      // …and it pushed it: a reload of that tab still shows it.
      await other.waitForTimeout(3000);
      await other.reload();
      await waitForApp(other);
      await expect(other.locator(`[data-note-card="${id}"]`)).toContainText(marker, { timeout: 20_000 });
      await ctx.close();

      // Case 2: full browser restart, fresh load.
      ctx = await launch();
      const reopened = ctx.pages()[0] ?? (await ctx.newPage());
      await reopened.goto("/");
      await waitForApp(reopened);
      const card = reopened.locator(`[data-note-card="${id}"]`);
      await expect(card).toContainText(marker, { timeout: 20_000 });
      await card.click();
      await expect(editor(reopened)).toContainText(marker);
    } finally {
      await ctx.close().catch(() => {});
    }
  });

  // Regression: a background refresh used to filter empty "New Note #N" notes
  // out of the store, so a just-created note vanished (and its editor closed)
  // when the poll landed. It must survive the 12s visible-tab refresh.
  test("an empty new note survives a background refresh", async ({ page }) => {
    test.slow();
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    const id = await activeCardId(page);
    await page.waitForTimeout(15_000); // > VISIBLE_REFRESH_INTERVAL (12s)
    await expect(noteCount(page)).toHaveText("1 note");
    expect(await activeCardId(page)).toBe(id);
    await expect(editor(page)).toBeVisible();
  });

  // E1: the shortcut must not steal focus from an open overlay (search modal).
  test("keyboard switch stands aside while search is open (E1)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    await page.keyboard.type("one");
    await page.keyboard.press("Control+j");
    await expect(noteCount(page)).toHaveText("2 notes");
    const before = await activeCardId(page);

    await page.keyboard.press("Control+k");
    const search = page.getByRole("dialog", { name: "Search notes" });
    await expect(search).toBeVisible();
    const input = search.locator("input").first();
    await expect(input).toBeFocused();

    await page.keyboard.press("Control+Alt+ArrowDown");
    await page.keyboard.press("Control+Alt+2");
    await expect(search).toBeVisible();
    await expect(input).toBeFocused();
    expect(await activeCardId(page)).toBe(before);
  });
});

// The id of the sidebar card for the open note (marked data-active="true").
async function activeCardId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-note-card][data-active="true"]');
    return el?.getAttribute("data-note-card") ?? null;
  });
}

// Signed-in specs share the seeded accounts (see e2e/global-setup.ts), so they
// run one at a time in a single worker: a parallel test adding notes to account
// A would break the B8 count assertion.
test.describe("signed-in", () => {
  test.describe.configure({ mode: "default" });

  test.describe("notes — cloud (Supabase, signed-in)", () => {
    test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key in .env.local)");

    test("create, edit, reload → content persists for the account", async ({ page }) => {
      const [acc] = seededAccounts();
      await signIn(page, acc);
      await page.goto("/");
      await waitForApp(page);

      const id = await newNote(page);
      const marker = `e2e-cloud-${Date.now()}`;
      await page.keyboard.type(marker);
      await expect(editor(page)).toContainText(marker);

      // It reached the account's row in Supabase (not just this browser's IDB).
      await expect.poll(() => cloudContent(id), { timeout: 15_000 }).toContain(marker);

      await page.reload();
      await waitForApp(page);
      await page.locator(`[data-note-card="${id}"]`).click();
      await expect(editor(page)).toContainText(marker);
    });

    // Acceptance test for B8 on the SIGNED-IN path — the one the bug was actually
    // reported on (cloud notes). A signed-in account may already hold notes, so
    // assert the footer count increments by exactly one the moment the note is
    // created, with NO reload and WITHOUT selecting another note first.
    test("new note appears in the sidebar immediately (B8) — cloud", async ({ page }) => {
      const [acc] = seededAccounts();
      await signIn(page, acc);
      await page.goto("/");
      await waitForApp(page);
      await expect(page.locator(NOTE_ROW).first()).toBeVisible(); // initial load landed

      const before = await readNoteCount(page);
      const rows = await page.locator(NOTE_ROW).count();
      const id = await newNote(page);
      await expect(noteCount(page)).toHaveText(new RegExp(`^${before + 1} notes?$`));
      // The new row is in the list immediately (not only after selecting another).
      await expect(page.locator(NOTE_ROW)).toHaveCount(rows + 1);
      await expect(page.locator(`[data-note-card="${id}"]`)).toBeVisible();
    });

    // Cloud tab-close: the last keystrokes are still inside the editor debounce
    // when the tab closes, so only the pagehide keepalive save
    // (/api/notes/leave-save) can get them to the server. With NO app tab open
    // afterwards, the account's row must still end up holding the text — and as
    // a normal save (version bump), not a conflicted copy.
    test("text typed just before closing the tab reaches the cloud (keepalive)", async ({ context }) => {
      const [acc] = seededAccounts();
      await signIn(context, acc);
      const page = await context.newPage();
      await page.goto("/");
      await waitForApp(page);
      const id = await newNote(page);
      await expect.poll(() => cloudVersion(id), { timeout: 15_000 }).not.toBeNull(); // create landed
      await page.waitForTimeout(2500); // let the initial save settle
      const v0 = await cloudVersion(id);
      const notesBefore = await cloudNoteCount(acc.id);

      const leaveSave = page.waitForRequest((r) => r.url().includes("/api/notes/leave-save"));
      const marker = `e2e-cloud-close-${Date.now()}`;
      await editor(page).click();
      await page.keyboard.press("End");
      await page.keyboard.type(marker);
      await page.close({ runBeforeUnload: true }); // no wait — inside the debounce
      expect((await leaveSave).method()).toBe("POST");

      await expect.poll(() => cloudContent(id), { timeout: 15_000 }).toContain(marker);
      expect(await cloudVersion(id)).toBeGreaterThan(v0 ?? 0);
      expect(await cloudNoteCount(acc.id)).toBe(notesBefore); // no conflicted copy

      // …and the next load shows it.
      const again = await context.newPage();
      await again.goto("/");
      await waitForApp(again);
      await again.locator(`[data-note-card="${id}"]`).click();
      await expect(editor(again)).toContainText(marker);
    });

    test.fixme("move a note local ↔ cloud", async () => {
      // TODO: transfer a local note to the account and back; assert source + survival.
    });
  });

  test.describe("account switching (B7)", () => {
    test.skip(seededAccounts().length < 2, "needs 2 seeded accounts");

    test("keeps the Switching… screen up until the new account loads", async ({ page }) => {
      const [a, b] = seededAccounts();
      await signIn(page, a, { alsoOnDevice: [b] });
      await page.goto("/");
      await waitForApp(page);
      await expect(page.locator(NOTE_ROW).first()).toBeVisible(); // A's notes are up

      await switchAccountViaUi(page, b);
      const screen = page.getByText(/Switching to/i);
      await expect(screen).toBeVisible();
      // Across the reload the hand-off screen stays until B's notes are in.
      await expect(screen).toBeHidden({ timeout: 20_000 });
      await waitForApp(page);
      await expect.poll(() => currentHandle(page)).toBe(b.handle);
      // None of A's notes are listed under B.
      await expect(page.locator(`[data-note-card="${seedState()!.sharedNote!.noteId}"]`)).toHaveCount(0);
    });

    // Offline switching is not allowed: it needs the auth server (session swap)
    // and the reload. The user stays on A with a clear message, B's stored
    // session is NOT marked expired, and A's offline edit stays queued for A —
    // it lands in A's account once back online and never under B.
    test("offline: switching is refused and the queued edit stays with the current account", async ({ page, context }) => {
      const [a, b] = seededAccounts();
      await signIn(page, a, { alsoOnDevice: [b] });
      await page.goto("/");
      await waitForApp(page);
      await expect(page.locator(NOTE_ROW).first()).toBeVisible();
      const id = await openSeededNote(page);
      await page.waitForTimeout(1500);

      // An edit for A while offline — it can only be queued on the device.
      await context.setOffline(true);
      const marker = `e2e-b7-${Date.now()}`;
      await editor(page).click();
      await page.keyboard.press("End");
      await page.keyboard.type(` ${marker}`);
      await page.waitForTimeout(1500); // let it enqueue to IDB

      // Try to switch to B: refused, no hand-off screen, still A.
      await page.locator('button[aria-label="Account"]').click();
      await page.getByRole("button", { name: new RegExp(`@${b.handle}`) }).click();
      await expect(page.getByText("You're offline. Switching accounts needs a connection.")).toBeVisible();
      await expect(page.getByText(/Switching to/i)).toHaveCount(0);
      await page.keyboard.press("Escape");
      // The ⌃1 shortcut (first other account) is refused the same way.
      await page.keyboard.press("Control+1");
      await page.waitForTimeout(500);
      await expect(page.getByText(/Switching to/i)).toHaveCount(0);
      await expect(editor(page)).toContainText(marker); // still on A's note, edit intact
      await context.setOffline(false);
      await expect.poll(() => currentHandle(page)).toBe(a.handle);

      // B's stored session was not marked expired by the failed attempt.
      const bEntry = await page.evaluate(
        (bid) => JSON.parse(localStorage.getItem("jn_accounts") || "[]").find((x: { id: string }) => x.id === bid),
        b.id,
      );
      expect(bEntry?.sessionValid).toBe(true);

      // Back online, the queued edit lands in A's account…
      await expect.poll(() => cloudContent(id), { timeout: 20_000 }).toContain(marker);

      // …and switching now works, with nothing of A's under B.
      await switchAccountViaUi(page, b);
      await expect(page.getByText(/Switching to/i)).toBeHidden({ timeout: 20_000 });
      await waitForApp(page);
      await expect.poll(() => currentHandle(page)).toBe(b.handle);
      await page.waitForTimeout(3000); // give any queued op time to (wrongly) replay
      await expect(page.getByText(marker)).toHaveCount(0);
      expect(await cloudNoteCount(b.id)).toBe(0);
    });
  });
});

// Create a cloud/local note with Ctrl+J and return its id (works whether or not
// a note is already open). The new note's editor is focused, ready to type.
async function newNote(page: Page): Promise<string> {
  const before = await activeCardId(page);
  await page.locator("body").press("Control+j");
  await expect.poll(() => activeCardId(page)).not.toBe(before);
  await expect(editor(page)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")))
    .toBe(true);
  return (await activeCardId(page))!;
}

// Open the seeded note (owned by A) and return its id.
async function openSeededNote(page: Page): Promise<string> {
  const id = seedState()!.sharedNote!.noteId;
  await page.locator(`[data-note-card="${id}"]`).click();
  await expect(editor(page)).toContainText("Shared with B");
  return id;
}

// Server-side truth for cloud specs (service-role read; test env only).
async function cloudRow(id: string) {
  const { data } = await adminClient().from("notes").select("content, version").eq("id", id).maybeSingle();
  return data as { content: string; version: number } | null;
}
const cloudContent = async (id: string) => (await cloudRow(id))?.content ?? "";
const cloudVersion = async (id: string) => (await cloudRow(id))?.version ?? null;
async function cloudNoteCount(userId: string): Promise<number> {
  const { count } = await adminClient()
    .from("notes")
    .select("id", { count: "exact", head: true })
    .eq("author", userId)
    .is("deleted_at", null);
  return count ?? 0;
}

// Drive the account switcher (online): open the Account menu, pick the target,
// and confirm the unsynced-work modal if it appears.
async function switchAccountViaUi(page: Page, target: SeededAccount): Promise<void> {
  await page.locator('button[aria-label="Account"]').click();
  await page.getByRole("button", { name: new RegExp(`@${target.handle}`) }).click();
  const confirm = page.getByRole("button", { name: "Switch account", exact: true });
  const switching = page.getByText(/Switching to/i);
  await expect(confirm.or(switching).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
}

// Which account is signed in: the user id in the @supabase/ssr auth cookie
// (what the server sees), cross-checked against the Account menu's current row.
async function currentHandle(page: Page): Promise<string | null> {
  const parts = (await page.context().cookies())
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  if (!parts.length) return null;
  let raw = parts.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
  const userId: string | undefined = JSON.parse(raw)?.user?.id;
  const acc = seededAccounts().find((x) => x.id === userId);
  if (!acc) return null;
  await page.locator('button[aria-label="Account"]').click();
  const row = page.getByText(`@${acc.handle}`, { exact: true }).first();
  await expect(row).toBeVisible();
  await page.keyboard.press("Escape");
  return acc.handle;
}

test.describe("sharing & collaboration", () => {
  test.fixme("share with edit access + two-context live editing without reload", async () => {});
  test.fixme("trash / restore and shared-note access gate", async () => {});
});

test.describe("account lifecycle", () => {
  test.fixme("account data export", async () => {});
  test.fixme("delete / restore account", async () => {});
});

test.describe("October features (no browser coverage yet)", () => {
  test.fixme("recipient pin/hide/sort/tags/drag-reorder", async () => {});
  test.fixme("unified shared NoteView + split view", async () => {});
  test.fixme("chat drawer open/close + send", async () => {});
  test.fixme("tags on standard notes", async () => {});
});
