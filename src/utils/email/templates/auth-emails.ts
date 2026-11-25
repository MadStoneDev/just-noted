// Supabase Auth emails (login codes, invites, email change, etc.). Sent by our
// Send Email hook (src/app/api/auth/send-email-hook) through Resend, so the
// templates live here rather than in the Supabase dashboard.
//
// The layout is the original login-code email: table-based, inline styles,
// light-only. Every value interpolated into HTML goes through escapeHtml.
//
// "valid for 1 hour" matches GoTrue's default OTP expiry (GOTRUE_MAILER_OTP_EXP
// = 3600s). Change OTP_EXPIRY_COPY if you change that setting.

export const OTP_EXPIRY_COPY = "1 hour";

export type AuthEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";

type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; code: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "note"; html: string; text: string };

type Content = {
  subject: string;
  preheader: string;
  intro: Block[];
  outro: Block[];
  footer: string;
};

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "p":
      return `<p style="margin:0 0 12px;">${escapeHtml(b.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;color:#6b6b6b;font-size:14px;">${b.html}</p>`;
    case "code":
      return `<div style="margin:8px 0 12px;text-align:center;background:#f2f6f6;border:1px solid #e3eae9;border-radius:12px;padding:18px 12px;font-family:${MONO};font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;text-indent:10px;">${escapeHtml(b.code)}</div>`;
    case "button":
      return `<div style="margin:8px 0 16px;text-align:center;"><a href="${escapeHtml(b.url)}" style="display:inline-block;background:#03BFB5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">${escapeHtml(b.label)}</a></div>`;
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case "p":
      return b.text;
    case "note":
      return b.text;
    case "code":
      return `    ${b.code}`;
    case "button":
      return `${b.label}:\n${b.url}`;
  }
}

function render(c: Content): AuthEmail {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f7;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f7f7;">${escapeHtml(c.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #ececec;border-radius:14px;">
          <tr>
            <td style="padding:32px 36px 0;">
              <span style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#03BFB5;letter-spacing:-0.01em;">JustNoted</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 4px;font-family:${SANS};font-size:15px;line-height:1.65;color:#1a1a1a;">
              <p style="margin:0 0 16px;">Hi,</p>
              ${c.intro.map(blockHtml).join("\n              ")}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 36px 32px;font-family:${SANS};font-size:15px;line-height:1.65;color:#1a1a1a;">
              ${c.outro.map(blockHtml).join("\n              ")}
              <p style="margin:0;">Best regards,<br>JustNoted</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding:18px 16px;font-family:${SANS};font-size:12px;line-height:1.6;color:#9aa0a0;">
              ${escapeHtml(c.footer)}<br>
              JustNoted &middot; <a href="https://justnoted.app" style="color:#9aa0a0;text-decoration:underline;">justnoted.app</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = [
    "Hi,",
    ...c.intro.map(blockText),
    ...c.outro.map(blockText),
    "Best regards,\nJustNoted",
    "--",
    `${c.footer}\nJustNoted: https://justnoted.app`,
  ].join("\n\n");

  return { subject: c.subject, html, text: text + "\n" };
}

const IGNORE = (what: string): Block => ({
  kind: "note",
  html: escapeHtml(`If you didn't ${what}, you can safely ignore this email.`),
  text: `If you didn't ${what}, you can safely ignore this email.`,
});

const SECURITY_NOTE: Block = {
  kind: "note",
  html: "If this wasn't you, reply to this email or contact <a href=\"mailto:hello@justnoted.app\" style=\"color:#03BFB5;\">hello@justnoted.app</a> straight away.",
  text: "If this wasn't you, reply to this email or contact hello@justnoted.app straight away.",
};

function confirmsAddress(email: string): Block {
  return {
    kind: "note",
    html: `This code is valid for ${OTP_EXPIRY_COPY} and confirms that <strong style="color:#1a1a1a;">${escapeHtml(email)}</strong> is the address on your account.`,
    text: `This code is valid for ${OTP_EXPIRY_COPY} and confirms that ${email} is the address on your account.`,
  };
}

/** Passwordless login code (magiclink, signup and email OTP all use this). */
export function loginCodeEmail(p: { token: string; email: string }): AuthEmail {
  return render({
    subject: `${p.token} is your JustNoted login code`,
    preheader: "Your JustNoted login code. Enter it to finish signing in.",
    intro: [{ kind: "p", text: "Enter this code to finish logging in. No password needed." }, { kind: "code", code: p.token }],
    outro: [confirmsAddress(p.email), IGNORE("try to log in")],
    footer: "This is an automated message from a passwordless sign-in request.",
  });
}

export function inviteEmail(p: { url: string; token: string }): AuthEmail {
  return render({
    subject: "You've been invited to JustNoted",
    preheader: "Accept your invitation to JustNoted.",
    intro: [
      { kind: "p", text: "You've been invited to join JustNoted. Accept the invitation to set up your account." },
      { kind: "button", label: "Accept invitation", url: p.url },
    ],
    outro: [
      { kind: "note", html: `The link is valid for ${OTP_EXPIRY_COPY}. Your invitation code is <strong style="color:#1a1a1a;">${escapeHtml(p.token)}</strong>.`, text: `The link is valid for ${OTP_EXPIRY_COPY}. Your invitation code is ${p.token}.` },
      IGNORE("expect this invitation"),
    ],
    footer: "This is an automated message about an invitation to JustNoted.",
  });
}

export function recoveryEmail(p: { url: string; token: string }): AuthEmail {
  return render({
    subject: `${p.token} is your JustNoted account recovery code`,
    preheader: "Use this to get back into your JustNoted account.",
    intro: [
      { kind: "p", text: "Use this button or code to get back into your account." },
      { kind: "button", label: "Recover account", url: p.url },
      { kind: "code", code: p.token },
    ],
    outro: [
      { kind: "note", html: `The link and code are valid for ${OTP_EXPIRY_COPY}.`, text: `The link and code are valid for ${OTP_EXPIRY_COPY}.` },
      IGNORE("ask to recover your account"),
    ],
    footer: "This is an automated message from an account recovery request.",
  });
}

/**
 * Email change. `to` is the address this copy goes to: the current address
 * confirms the change is wanted, the new address confirms it can receive mail.
 */
export function emailChangeEmail(p: {
  to: "current" | "new";
  url: string;
  token: string;
  currentEmail: string;
  newEmail: string;
}): AuthEmail {
  const what =
    p.to === "current"
      ? `Someone asked to change the email address on your JustNoted account from ${p.currentEmail} to ${p.newEmail}. Confirm to approve the change.`
      : `Confirm this address to finish changing the email on your JustNoted account to ${p.newEmail}.`;
  return render({
    subject: "Confirm your new JustNoted email address",
    preheader: "Confirm the change to your JustNoted email address.",
    intro: [
      { kind: "p", text: what },
      { kind: "button", label: "Confirm email change", url: p.url },
      { kind: "code", code: p.token },
    ],
    outro: [
      { kind: "note", html: `The link and code are valid for ${OTP_EXPIRY_COPY}.`, text: `The link and code are valid for ${OTP_EXPIRY_COPY}.` },
      p.to === "current" ? SECURITY_NOTE : IGNORE("ask for this change"),
    ],
    footer: "This is an automated message about a change to your account.",
  });
}

export function reauthenticationEmail(p: { token: string }): AuthEmail {
  return render({
    subject: `${p.token} is your JustNoted confirmation code`,
    preheader: "Confirm it's you to finish your account change.",
    intro: [{ kind: "p", text: "Enter this code to confirm it's you and finish your account change." }, { kind: "code", code: p.token }],
    outro: [
      { kind: "note", html: `This code is valid for ${OTP_EXPIRY_COPY}.`, text: `This code is valid for ${OTP_EXPIRY_COPY}.` },
      SECURITY_NOTE,
    ],
    footer: "This is an automated message from a request to change your account.",
  });
}

/** Security notices GoTrue sends after the fact (only if enabled in GoTrue). */
export function securityNoticeEmail(p: { headline: string; detail: string }): AuthEmail {
  return render({
    subject: `JustNoted security notice: ${p.headline}`,
    preheader: p.detail,
    intro: [{ kind: "p", text: p.detail }],
    outro: [SECURITY_NOTE],
    footer: "This is an automated security notice about your account.",
  });
}
