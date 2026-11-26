import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/actions/supabaseActions", () => ({
  updateNote: vi.fn(async () => ({ success: true, version: 4 })),
}));
vi.mock("@/app/actions/notes", () => ({
  noteOperation: vi.fn(async () => ({ success: true, version: 7 })),
}));

import { POST } from "./route";
import { updateNote } from "@/app/actions/supabaseActions";
import { noteOperation } from "@/app/actions/notes";
import { LEAVE_SAVE_MAX_BYTES } from "@/utils/leave-save";

const URL_ = "http://localhost:3050/api/notes/leave-save";
const GUEST = "11111111-1111-4111-8111-111111111111";
const COPY = "00000000-0000-4000-8000-0000000000c1";

function req(body: unknown, init: { headers?: Record<string, string>; raw?: string } = {}) {
  return new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3050", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}
const payload = (over: Record<string, unknown> = {}) => ({
  noteId: "n1",
  content: "last words",
  goal: 0,
  goalType: "",
  baseVersion: 3,
  copyId: COPY,
  copyStamp: "26 Nov, 4:00 pm",
  ...over,
});

beforeEach(() => {
  vi.mocked(updateNote).mockClear();
  vi.mocked(noteOperation).mockClear();
});
afterEach(() => {
  delete process.env.E2E_TEST_HOOKS;
});

describe("leave-save route", () => {
  it("cloud (default source): background CAS via updateNote", async () => {
    const res = await POST(req(payload()));
    expect(res.status).toBe(200);
    expect(vi.mocked(updateNote).mock.calls[0]).toEqual([
      "n1",
      "last words",
      0,
      "",
      { baseVersion: 3, conflictCopy: { id: COPY, stamp: "26 Nov, 4:00 pm" } },
    ]);
    expect(noteOperation).not.toHaveBeenCalled();
  });

  it("guest: the same path as the guest autosave, under the device id", async () => {
    const res = await POST(req(payload({ source: "redis", userId: GUEST })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, version: 7 });
    expect(vi.mocked(noteOperation).mock.calls[0]).toEqual([
      "redis",
      {
        operation: "update",
        userId: GUEST,
        noteId: "n1",
        content: "last words",
        goal: 0,
        goalType: "",
        baseVersion: 3,
        conflictCopy: { id: COPY, stamp: "26 Nov, 4:00 pm" },
      },
    ]);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("guest: refuses a missing or non-UUID device id", async () => {
    expect((await POST(req(payload({ source: "redis" })))).status).toBe(400);
    expect((await POST(req(payload({ source: "redis", userId: "notes:*" })))).status).toBe(400);
    expect(noteOperation).not.toHaveBeenCalled();
  });

  it("guest: a failed save (e.g. another id's note: not found) is a 500, not a write", async () => {
    vi.mocked(noteOperation).mockResolvedValueOnce({ success: false, error: "Note n1 not found." });
    expect((await POST(req(payload({ source: "redis", userId: GUEST })))).status).toBe(500);
  });

  it("refuses an unknown source, a cross-site origin, a missing base version", async () => {
    expect((await POST(req(payload({ source: "s3" })))).status).toBe(400);
    expect((await POST(req(payload(), { headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await POST(req(payload({ baseVersion: undefined })))).status).toBe(409);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("caps the body (declared or streamed)", async () => {
    const big = payload({ content: "a".repeat(LEAVE_SAVE_MAX_BYTES * 2 + 10) });
    expect((await POST(req(big))).status).toBe(413);
    const lying = req(big, { headers: { "content-length": "10" } });
    expect((await POST(lying)).status).toBe(413);
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("test drop hook: only with E2E_TEST_HOOKS=1 on the server AND the cookie", async () => {
    const cookie = { cookie: "a=1; e2e_drop_leave_save=1" };
    // Cookie alone (any deployed server): ignored, the save happens.
    expect((await POST(req(payload(), { headers: cookie }))).status).toBe(200);
    expect(updateNote).toHaveBeenCalledTimes(1);

    process.env.E2E_TEST_HOOKS = "1";
    const res = await POST(req(payload(), { headers: cookie }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ dropped: true });
    expect(updateNote).toHaveBeenCalledTimes(1);
    // Env without the cookie: saved.
    expect((await POST(req(payload()))).status).toBe(200);
    expect(updateNote).toHaveBeenCalledTimes(2);
  });
});
