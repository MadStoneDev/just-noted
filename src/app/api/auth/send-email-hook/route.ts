import { NextResponse } from "next/server";
import {
  buildAuthEmails,
  HookInputError,
  parseHookSecrets,
  parsePayload,
  verifyStandardWebhook,
} from "@/utils/email/auth-hook";
import { sendEmailDetailed } from "@/utils/email/send";

// GoTrue "Send Email" hook (GOTRUE_HOOK_SEND_EMAIL_*). GoTrue calls this
// instead of SMTP for every auth email; we render the email and send it
// through Resend.
//
// Response contract (supabase/auth internal/hooks/hookshttp):
//   - success: 200 + application/json body "{}"
//   - failure: 200 + {"error":{"http_code":N,"message":"..."}}. GoTrue only
//     reads the error body on 200/202 and passes http_code + message to the
//     client. Any other status becomes a generic 500 on GoTrue's side.
// GoTrue gives the hook about 5s in total, so Resend calls are capped below that.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_TIMEOUT_MS = 4000;

function ok() {
  return NextResponse.json({}, { status: 200 });
}

function hookError(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: 200 });
}

export async function POST(request: Request) {
  const secrets = parseHookSecrets(process.env.SEND_EMAIL_HOOK_SECRET);
  if (secrets.length === 0) {
    console.error("[auth-email-hook] SEND_EMAIL_HOOK_SECRET is not set");
    return hookError(500, "Email hook is not configured");
  }

  const body = await request.text();
  const valid = verifyStandardWebhook({
    body,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    secrets,
  });
  if (!valid) {
    // Not from GoTrue: a real 401, no detail.
    return NextResponse.json({ error: { http_code: 401, message: "Invalid signature" } }, { status: 401 });
  }

  let payload;
  try {
    payload = parsePayload(JSON.parse(body));
  } catch {
    payload = null;
  }
  if (!payload) return hookError(400, "Invalid send email hook payload");

  let emails;
  try {
    emails = buildAuthEmails(payload, process.env.NEXT_PUBLIC_APP_URL);
  } catch (e) {
    if (e instanceof HookInputError) {
      console.error("[auth-email-hook]", e.message, { type: payload.email_data.email_action_type });
      return hookError(400, e.message);
    }
    throw e;
  }

  const webhookId = request.headers.get("webhook-id")!;
  const results = await Promise.all(
    emails.map((email) =>
      sendEmailDetailed({
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `auth-hook/${webhookId}/${email.key}`,
        timeoutMs: RESEND_TIMEOUT_MS,
      }),
    ),
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    for (const f of failed) {
      if (!f.ok) {
        console.error("[auth-email-hook] Resend send failed:", {
          type: payload.email_data.email_action_type,
          status: f.status,
          error: f.error,
        });
      }
    }
    const rateLimited = failed.some((f) => !f.ok && f.status === 429);
    return rateLimited
      ? hookError(429, "Too many emails sent. Please wait a minute and try again.")
      : hookError(500, "We couldn't send the email. Please try again.");
  }

  return ok();
}
