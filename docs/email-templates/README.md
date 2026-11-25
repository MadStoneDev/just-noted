# JustNoted email templates

Where every email the product sends comes from, and how to update it.

## 1. Auth emails (login code, invite, email change, etc.): **sent by our code (Resend)**

Supabase Auth (self-hosted GoTrue) doesn't send email itself. Its Send Email
hook POSTs every auth email to `src/app/api/auth/send-email-hook/route.ts`,
which checks the Standard Webhooks signature, renders the email and sends it
through Resend. There is no SMTP and nothing to paste into Supabase.

- **Templates:** `src/utils/email/templates/auth-emails.ts` (HTML and plain
  text). The login-code email is the original `login-code.html` design.
- **Which email for which action:** `buildAuthEmails` in
  `src/utils/email/auth-hook.ts`. `magiclink`, `signup` and `email` all get the
  login code (that's what `signInWithOtp` sends, `src/app/get-access/actions.ts`).
  `invite`, `recovery` and `email_change` include a link to `/auth/confirm`.
  `email_change` with secure email change on emails both the current and the
  new address. The `*_notification` security notices are only sent if enabled
  in GoTrue (`GOTRUE_MAILER_NOTIFICATIONS_*_ENABLED`).
- **Expiry copy:** "valid for 1 hour" matches GoTrue's default OTP expiry
  (`GOTRUE_MAILER_OTP_EXP=3600`). Update `OTP_EXPIRY_COPY` if you change it.
- **Setup and rollback:** see "Auth emails" in the root `README.md`.

## 2. Contact form emails — **sent by our code (Resend)**

`src/app/actions/emailActions.ts`, both fired by `submitContactForm`:

- **Admin notification** → `hello@justnoted.app` (`getAdminEmailHtml`), subject
  `JustNoted Contact: {name}`.
- **Auto-reply** → the sender (`getUserConfirmationHtml`), subject
  `Thanks for contacting JustNoted`.

Both share the branded `emailShell()` helper in that file (serif "JustNoted"
wordmark, white card on a soft ground, teal accent). Edit the templates there.

## 3. Billing — **sent by Stripe**

Receipts, renewal/dunning, and subscription notices are sent by Stripe. Our
webhook (`src/app/api/webhooks/stripe`) only processes events; it sends no email.

## Brand notes

- Wordmark: "JustNoted" in Playfair Display (serif), teal `#03BFB5`, with a
  Georgia/serif fallback (most email clients won't load the web font).
- Ink `#1a1a1a`, muted `#6b6b6b`, hairline `#eef1f1`, ground `#f4f7f7`.
- Table-based, inline styles, light-only — the norm for reliable email rendering.
