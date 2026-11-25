import "server-only";

const FROM = "JustNoted <hello@justnoted.app>";

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; status?: number; error: string };

// Resend sender that reports why a send failed. Never throws.
export async function sendEmailDetailed(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // Resend dedupes sends with the same key for 24h, so a retried request
  // doesn't deliver the same email twice.
  idempotencyKey?: string;
  timeoutMs?: number;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not set" };
  if (!opts.to) return { ok: false, error: "No recipient" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body || `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Minimal best-effort sender used by the rest of the app: returns false and
// logs on failure, never throws.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  if (!opts.to) return false;
  const result = await sendEmailDetailed(opts);
  if (!result.ok) console.error("[email] Resend send failed:", result.error);
  return result.ok;
}
