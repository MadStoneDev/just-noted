# Just Noted — email templates

Where every email the product sends comes from, and how to update it.

## 1. Login code (passwordless OTP) — **sent by Supabase**

Triggered by `supabase.auth.signInWithOtp` (`src/app/get-access/actions.ts`). The
email itself is composed and sent by Supabase, so its template lives in the
**Supabase dashboard**, not in this repo. `login-code.html` here is the
source-of-truth copy — keep them in sync.

- **Where to paste:** Supabase Dashboard → Authentication → Email Templates →
  **Magic Link** → *Message body*.
- **Subject line:** `{{ .Token }} — Your Just Noted login code`
- **Variables:** `{{ .Token }}` (6-digit code), `{{ .Email }}` (recipient).
- **Expiry copy:** "valid for 1 hour" matches Supabase's default OTP expiry
  (3600s), set under Authentication → Providers → Email → OTP expiry. Update the
  wording if you change it.

## 2. Contact form emails — **sent by our code (Resend)**

`src/app/actions/emailActions.ts`, both fired by `submitContactForm`:

- **Admin notification** → `hello@justnoted.app` (`getAdminEmailHtml`), subject
  `Just Noted Contact: {name}`.
- **Auto-reply** → the sender (`getUserConfirmationHtml`), subject
  `Thank you for contacting Just Noted!`.

Both share the branded `emailShell()` helper in that file (serif "Just Noted"
wordmark, white card on a soft ground, teal accent). Edit the templates there.

## 3. Billing — **sent by Paddle**

Receipts, renewal/dunning, and subscription notices are sent by Paddle. Our
webhook (`src/app/api/webhooks/paddle`) only processes events; it sends no email.

## Brand notes

- Wordmark: "Just Noted" in Playfair Display (serif), teal `#03BFB5`, with a
  Georgia/serif fallback (most email clients won't load the web font).
- Ink `#1a1a1a`, muted `#6b6b6b`, hairline `#eef1f1`, ground `#f4f7f7`.
- Table-based, inline styles, light-only — the norm for reliable email rendering.
