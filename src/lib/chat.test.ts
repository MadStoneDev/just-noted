import { describe, it, expect } from "vitest";
import { toMessageView, type ChatAuthor, type ChatMessageRow } from "@/lib/chat";

const authors = new Map<string, ChatAuthor>([
  ["u1", { id: "u1", username: "ada", avatarUrl: "https://x/a.png" }],
  ["u2", { id: "u2", username: "grace", avatarUrl: null }],
]);

function row(over: Partial<ChatMessageRow> = {}): ChatMessageRow {
  return {
    id: "m1",
    note_id: "n1",
    author_id: "u1",
    kind: "text",
    body: "hello",
    reply_to: null,
    anchor: null,
    media_key: null,
    media_mime: null,
    media_meta: null,
    created_at: "2026-09-30T00:00:00Z",
    edited_at: null,
    deleted_at: null,
    ...over,
  };
}

describe("toMessageView", () => {
  it("maps a normal message and resolves the author", () => {
    const v = toMessageView(row(), "u2", authors);
    expect(v.body).toBe("hello");
    expect(v.authorName).toBe("ada");
    expect(v.authorAvatar).toBe("https://x/a.png");
    expect(v.isOwn).toBe(false);
    expect(v.isDeleted).toBe(false);
    expect(v.isEdited).toBe(false);
    expect(v.hasMedia).toBe(false);
  });

  it("flags the viewer's own message", () => {
    expect(toMessageView(row(), "u1", authors).isOwn).toBe(true);
  });

  it("marks an edited message", () => {
    const v = toMessageView(row({ edited_at: "2026-09-30T01:00:00Z" }), "u1", authors);
    expect(v.isEdited).toBe(true);
  });

  it("a deleted message becomes a tombstone (no body/media, keeps author + time)", () => {
    const v = toMessageView(
      row({ deleted_at: "2026-09-30T02:00:00Z", body: "secret", media_key: "k", kind: "image" }),
      "u2",
      authors,
    );
    expect(v.isDeleted).toBe(true);
    expect(v.body).toBeNull();
    expect(v.hasMedia).toBe(false);
    expect(v.isEdited).toBe(false); // never "(edited)" once deleted
    expect(v.kind).toBe("text");
    expect(v.authorName).toBe("ada"); // author + timestamp preserved
    expect(v.createdAt).toBe("2026-09-30T00:00:00Z");
  });

  it("an unresolvable author renders as 'Deleted user'", () => {
    const v = toMessageView(row({ author_id: "gone" }), "u1", authors);
    expect(v.authorName).toBe("Deleted user");
    expect(v.authorAvatar).toBeNull();
    expect(v.isOwn).toBe(false);
  });

  it("treats a media-only message as having media", () => {
    const v = toMessageView(row({ body: null, kind: "audio", media_key: "audio/x.webm" }), "u1", authors);
    expect(v.hasMedia).toBe(true);
    expect(v.body).toBeNull();
  });
});
