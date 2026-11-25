import { createHmac, timingSafeEqual } from "crypto";
import {
  type AuthEmail,
  emailChangeEmail,
  inviteEmail,
  loginCodeEmail,
  reauthenticationEmail,
  recoveryEmail,
  securityNoticeEmail,
} from "./templates/auth-emails";

// ---------------------------------------------------------------------------
// Standard Webhooks signature (what GoTrue signs HTTP hooks with).
// Signed content: `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256
// keyed with the base64-decoded secret, sent as "v1,<base64>" in
// webhook-signature (several signatures may be listed, space or ", " separated).
// ---------------------------------------------------------------------------

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Accepts the secret exactly as configured in GoTrue ("v1,whsec_<base64>"),
 * or without the "v1," / "whsec_" prefixes. Several secrets can be separated
 * with "|" (same as GOTRUE_HOOK_SEND_EMAIL_SECRETS) to rotate without downtime.
 */
export function parseHookSecrets(raw: string | undefined): Buffer[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => s.trim().replace(/^v1,/, "").replace(/^whsec_/, ""))
    .filter(Boolean)
    .map((s) => Buffer.from(s, "base64"))
    .filter((b) => b.length > 0);
}

export function signStandardWebhook(secret: Buffer, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifyStandardWebhook(opts: {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secrets: Buffer[];
  nowSeconds?: number;
}): boolean {
  const { body, id, timestamp, signature, secrets } = opts;
  if (!id || !timestamp || !signature || secrets.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const provided = [...signature.matchAll(/v1,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], "base64"));
  if (provided.length === 0) return false;

  return secrets.some((secret) => {
    const expected = Buffer.from(signStandardWebhook(secret, id, timestamp, body), "base64");
    return provided.some((p) => p.length === expected.length && timingSafeEqual(p, expected));
  });
}

// ---------------------------------------------------------------------------
// Payload (GoTrue SendEmailInput). All email_data keys are always present;
// unused ones are empty strings.
// ---------------------------------------------------------------------------

export type SendEmailHookPayload = {
  user: {
    id: string;
    email: string;
    new_email?: string;
    phone?: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email?: string;
    old_phone?: string;
    provider?: string;
    factor_type?: string;
  };
};

export function parsePayload(raw: unknown): SendEmailHookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const user = r.user as Record<string, unknown> | undefined;
  const data = r.email_data as Record<string, unknown> | undefined;
  if (!user || typeof user !== "object" || !data || typeof data !== "object") return null;
  if (typeof data.email_action_type !== "string" || !data.email_action_type) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    user: { id: str(user.id), email: str(user.email), new_email: str(user.new_email), phone: str(user.phone) },
    email_data: {
      token: str(data.token),
      token_hash: str(data.token_hash),
      redirect_to: str(data.redirect_to),
      email_action_type: data.email_action_type,
      site_url: str(data.site_url),
      token_new: str(data.token_new),
      token_hash_new: str(data.token_hash_new),
      old_email: str(data.old_email),
      old_phone: str(data.old_phone),
      provider: str(data.provider),
      factor_type: str(data.factor_type),
    },
  };
}

// ---------------------------------------------------------------------------
// Building the messages for each action type
// ---------------------------------------------------------------------------

export type OutgoingEmail = AuthEmail & { to: string; key: string };

export class HookInputError extends Error {}

function confirmUrl(base: string, tokenHash: string, type: string): string {
  const url = new URL("/auth/confirm", base);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/");
  return url.toString();
}

function need(value: string | undefined, what: string): string {
  if (!value) throw new HookInputError(`Missing ${what}`);
  return value;
}

/**
 * Turns a hook payload into the email(s) to send. Throws HookInputError for a
 * payload we can't act on (unknown action type, missing token or address).
 */
export function buildAuthEmails(p: SendEmailHookPayload, appUrl?: string): OutgoingEmail[] {
  const { user, email_data: d } = p;
  const base = appUrl || d.site_url || "https://justnoted.app";
  const type = d.email_action_type;

  switch (type) {
    case "magiclink":
    case "signup":
    case "email": {
      const to = need(user.email, "user.email");
      return [{ to, key: "main", ...loginCodeEmail({ token: need(d.token, "token"), email: to }) }];
    }

    case "invite":
      return [
        {
          to: need(user.email, "user.email"),
          key: "main",
          ...inviteEmail({ token: need(d.token, "token"), url: confirmUrl(base, need(d.token_hash, "token_hash"), "invite") }),
        },
      ];

    case "recovery":
      return [
        {
          to: need(user.email, "user.email"),
          key: "main",
          ...recoveryEmail({ token: need(d.token, "token"), url: confirmUrl(base, need(d.token_hash, "token_hash"), "recovery") }),
        },
      ];

    case "email_change": {
      const newEmail = need(user.new_email, "user.new_email");
      const currentEmail = user.email;
      // Secure email change (GoTrue default) sends one hook call with two token
      // pairs. GoTrue's hash field names are reversed for backward
      // compatibility:
      //   current address (user.email):    token     + token_hash_new
      //   new address     (user.new_email): token_new + token_hash
      if (d.token_new || d.token_hash_new) {
        const common = { currentEmail: need(currentEmail, "user.email"), newEmail };
        return [
          {
            to: currentEmail,
            key: "current",
            ...emailChangeEmail({
              ...common,
              to: "current",
              token: need(d.token, "token"),
              url: confirmUrl(base, need(d.token_hash_new, "token_hash_new"), "email_change"),
            }),
          },
          {
            to: newEmail,
            key: "new",
            ...emailChangeEmail({
              ...common,
              to: "new",
              token: need(d.token_new, "token_new"),
              url: confirmUrl(base, need(d.token_hash, "token_hash"), "email_change"),
            }),
          },
        ];
      }
      // Secure email change off: only the new address gets a code.
      return [
        {
          to: newEmail,
          key: "new",
          ...emailChangeEmail({
            to: "new",
            currentEmail,
            newEmail,
            token: need(d.token, "token"),
            url: confirmUrl(base, need(d.token_hash, "token_hash"), "email_change"),
          }),
        },
      ];
    }

    case "reauthentication":
      return [{ to: need(user.email, "user.email"), key: "main", ...reauthenticationEmail({ token: need(d.token, "token") }) }];

    // Security notifications (only sent if GOTRUE_MAILER_NOTIFICATIONS_*_ENABLED).
    case "password_changed_notification":
      return notice(user.email, "password changed", "The password on your JustNoted account was just changed.");
    case "email_changed_notification":
      // Tell the old address: that's the one that may have lost access.
      return notice(
        d.old_email || user.email,
        "email address changed",
        d.old_email
          ? `The email address on your JustNoted account was changed from ${d.old_email} to ${user.email}.`
          : `The email address on your JustNoted account was changed to ${user.email}.`,
      );
    case "phone_changed_notification":
      return notice(user.email, "phone number changed", "The phone number on your JustNoted account was just changed.");
    case "identity_linked_notification":
      return notice(user.email, "sign-in method added", `A new sign-in method${d.provider ? ` (${d.provider})` : ""} was linked to your JustNoted account.`);
    case "identity_unlinked_notification":
      return notice(user.email, "sign-in method removed", `A sign-in method${d.provider ? ` (${d.provider})` : ""} was removed from your JustNoted account.`);
    case "mfa_factor_enrolled_notification":
      return notice(user.email, "two-factor method added", `A two-factor authentication method${d.factor_type ? ` (${d.factor_type})` : ""} was added to your JustNoted account.`);
    case "mfa_factor_unenrolled_notification":
      return notice(user.email, "two-factor method removed", `A two-factor authentication method${d.factor_type ? ` (${d.factor_type})` : ""} was removed from your JustNoted account.`);

    default:
      throw new HookInputError(`Unsupported email_action_type: ${type}`);
  }
}

function notice(to: string, headline: string, detail: string): OutgoingEmail[] {
  return [{ to: need(to, "user.email"), key: "main", ...securityNoticeEmail({ headline, detail }) }];
}
