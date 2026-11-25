import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { signStandardWebhook, verifyStandardWebhook, parseHookSecrets } from "@/utils/email/auth-hook";

const SECRET_BYTES = randomBytes(32);
const SECRET = `v1,whsec_${SECRET_BYTES.toString("base64")}`;
const APP_URL = "https://app.justnoted.test";

type Sent = { to: string[]; subject: string; html: string; text: string; idempotencyKey: string | null };
let sent: Sent[];
let resendStatus: number;

function payload(type: string, data: Record<string, string> = {}, user: Record<string, string> = {}) {
  return {
    metadata: { uuid: "m1", time: "2026-11-26T00:00:00Z", name: "send-email" },
    user: { id: "u1", email: "old@example.com", ...user },
    email_data: {
      token: "123456",
      token_hash: "hash-a",
      redirect_to: "",
      email_action_type: type,
      site_url: "https://gotrue-site.test",
      token_new: "",
      token_hash_new: "",
      old_email: "",
      old_phone: "",
      provider: "",
      factor_type: "",
      ...data,
    },
  };
}

function signedRequest(
  body: unknown,
  opts: { secret?: Buffer; id?: string; timestamp?: number; signature?: string | null } = {},
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts };
  const sig = opts.signature === undefined ? `v1,${signStandardWebhook(opts.secret ?? SECRET_BYTES, id, ts, raw)}` : opts.signature;
  if (sig !== null) headers["webhook-signature"] = sig;
  return new Request("http://localhost/api/auth/send-email-hook", { method: "POST", headers, body: raw });
}

beforeEach(() => {
  sent = [];
  resendStatus = 200;
  vi.stubEnv("SEND_EMAIL_HOOK_SECRET", SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.resend.com/emails");
      const headers = new Headers(init.headers);
      sent.push({ ...JSON.parse(String(init.body)), idempotencyKey: headers.get("idempotency-key") });
      return resendStatus === 200
        ? new Response(JSON.stringify({ id: "email_1" }), { status: 200 })
        : new Response(JSON.stringify({ message: "nope" }), { status: resendStatus });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(req: Request) {
  const res = await POST(req);
  return { status: res.status, body: await res.json(), contentType: res.headers.get("content-type") };
}

describe("signature verification", () => {
  it("accepts a valid signature and returns 200 {}", async () => {
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("application/json");
    expect(r.body).toEqual({});
    expect(sent).toHaveLength(1);
  });

  it("rejects a request with no signature", async () => {
    const r = await call(signedRequest(payload("magiclink"), { signature: null }));
    expect(r.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("rejects a signature made with another secret", async () => {
    const r = await call(signedRequest(payload("magiclink"), { secret: randomBytes(32) }));
    expect(r.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("rejects a tampered body", async () => {
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const good = JSON.stringify(payload("magiclink"));
    const sig = signStandardWebhook(SECRET_BYTES, id, ts, good);
    const tampered = good.replace("old@example.com", "attacker@example.com");
    const r = await call(signedRequest(tampered, { id, timestamp: Number(ts), signature: `v1,${sig}` }));
    expect(r.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("rejects a stale timestamp (replay)", async () => {
    const r = await call(signedRequest(payload("magiclink"), { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(r.status).toBe(401);
  });

  it("accepts any matching signature in a multi-signature header (GoTrue joins with ', ')", async () => {
    const id = "msg_2";
    const ts = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify(payload("magiclink"));
    const good = signStandardWebhook(SECRET_BYTES, id, String(ts), raw);
    const other = signStandardWebhook(randomBytes(32), id, String(ts), raw);
    const r = await call(signedRequest(raw, { id, timestamp: ts, signature: `v1,${other}, v1,${good}` }));
    expect(r.status).toBe(200);
  });

  it("supports rotating secrets separated by |", () => {
    const old = randomBytes(32);
    const secrets = parseHookSecrets(`v1,whsec_${SECRET_BYTES.toString("base64")}|v1,whsec_${old.toString("base64")}`);
    const sig = signStandardWebhook(old, "id", "100", "{}");
    expect(verifyStandardWebhook({ body: "{}", id: "id", timestamp: "100", signature: `v1,${sig}`, secrets, nowSeconds: 100 })).toBe(true);
  });

  it("returns a GoTrue error when the secret isn't configured", async () => {
    vi.stubEnv("SEND_EMAIL_HOOK_SECRET", "");
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.status).toBe(200);
    expect(r.body.error.http_code).toBe(500);
    expect(sent).toHaveLength(0);
  });
});

describe("action types", () => {
  it.each(["magiclink", "signup", "email"])("%s sends the login code to user.email", async (type) => {
    const r = await call(signedRequest(payload(type)));
    expect(r.body).toEqual({});
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["old@example.com"]);
    expect(sent[0].subject).toBe("123456 is your JustNoted login code");
    expect(sent[0].html).toContain("123456");
    expect(sent[0].html).toContain("old@example.com");
    expect(sent[0].text).toContain("123456");
    expect(sent[0].text).not.toContain("<");
  });

  it("invite links to /auth/confirm with type=invite", async () => {
    await call(signedRequest(payload("invite")));
    expect(sent[0].to).toEqual(["old@example.com"]);
    expect(sent[0].subject).toMatch(/invited/);
    const link = `${APP_URL}/auth/confirm?token_hash=hash-a&amp;type=invite&amp;next=%2F`;
    expect(sent[0].html).toContain(link);
    expect(sent[0].text).toContain(`${APP_URL}/auth/confirm?token_hash=hash-a&type=invite&next=%2F`);
  });

  it("recovery sends a code and a type=recovery link", async () => {
    await call(signedRequest(payload("recovery")));
    expect(sent[0].subject).toBe("123456 is your JustNoted account recovery code");
    expect(sent[0].text).toContain("type=recovery");
    expect(sent[0].text).toContain("123456");
  });

  it("reauthentication sends the code", async () => {
    await call(signedRequest(payload("reauthentication")));
    expect(sent[0].subject).toBe("123456 is your JustNoted confirmation code");
    expect(sent[0].to).toEqual(["old@example.com"]);
  });

  it("email_change with secure change sends both addresses their own token (hash names reversed)", async () => {
    await call(
      signedRequest(
        payload(
          "email_change",
          { token: "111111", token_hash: "hash-for-new", token_new: "222222", token_hash_new: "hash-for-current" },
          { new_email: "new@example.com" },
        ),
      ),
    );
    expect(sent).toHaveLength(2);
    const current = sent.find((s) => s.to[0] === "old@example.com")!;
    const next = sent.find((s) => s.to[0] === "new@example.com")!;
    expect(current.text).toContain("111111");
    expect(current.text).toContain("token_hash=hash-for-current");
    expect(current.text).not.toContain("222222");
    expect(next.text).toContain("222222");
    expect(next.text).toContain("token_hash=hash-for-new");
    expect(next.text).not.toContain("111111");
    expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(2);
  });

  it("email_change without secure change emails only the new address", async () => {
    await call(signedRequest(payload("email_change", { token: "333333", token_hash: "h" }, { new_email: "new@example.com" })));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["new@example.com"]);
    expect(sent[0].text).toContain("333333");
  });

  it.each([
    "password_changed_notification",
    "phone_changed_notification",
    "identity_linked_notification",
    "identity_unlinked_notification",
    "mfa_factor_enrolled_notification",
    "mfa_factor_unenrolled_notification",
  ])("%s sends a security notice", async (type) => {
    const r = await call(signedRequest(payload(type, { token: "", token_hash: "" })));
    expect(r.body).toEqual({});
    expect(sent[0].to).toEqual(["old@example.com"]);
    expect(sent[0].subject).toMatch(/^JustNoted security notice:/);
  });

  it("email_changed_notification goes to the old address", async () => {
    await call(signedRequest(payload("email_changed_notification", { old_email: "was@example.com" }, { email: "now@example.com" })));
    expect(sent[0].to).toEqual(["was@example.com"]);
    expect(sent[0].text).toContain("now@example.com");
  });

  it("escapes HTML in interpolated values", async () => {
    await call(signedRequest(payload("magiclink", {}, { email: `"><script>x</script>@example.com` })));
    expect(sent[0].html).not.toContain("<script>");
    expect(sent[0].html).toContain("&lt;script&gt;");
  });

  it("returns a GoTrue 400 error for an unknown action type", async () => {
    const r = await call(signedRequest(payload("carrier_pigeon")));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ error: { http_code: 400, message: "Unsupported email_action_type: carrier_pigeon" } });
    expect(sent).toHaveLength(0);
  });

  it("returns a GoTrue 400 error for a malformed (but signed) payload", async () => {
    const r = await call(signedRequest("not json"));
    expect(r.body.error.http_code).toBe(400);
  });
});

describe("Resend failure", () => {
  it("returns a GoTrue 500 error when Resend fails", async () => {
    resendStatus = 500;
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ error: { http_code: 500, message: "We couldn't send the email. Please try again." } });
  });

  it("passes Resend rate limiting through as 429", async () => {
    resendStatus = 429;
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.body.error.http_code).toBe(429);
  });

  it("returns an error when fetch throws (network/timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.body.error.http_code).toBe(500);
  });

  it("returns an error when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND", "");
    const r = await call(signedRequest(payload("magiclink")));
    expect(r.body.error.http_code).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it("fails the whole hook if either email_change copy fails", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++ === 0 ? new Response("{}", { status: 200 }) : new Response("{}", { status: 500 }))));
    const r = await call(
      signedRequest(payload("email_change", { token_new: "2", token_hash_new: "h2" }, { new_email: "new@example.com" })),
    );
    expect(r.body.error.http_code).toBe(500);
  });
});
