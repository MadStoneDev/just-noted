This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Auth emails (Supabase Send Email hook + Resend)

Supabase Auth is self-hosted with no SMTP. GoTrue's Send Email hook POSTs every
auth email (login code, signup, invite, recovery, email change,
reauthentication, security notices) to `POST /api/auth/send-email-hook`. The
route verifies the Standard Webhooks signature, renders HTML and plain text from
`src/utils/email/templates/auth-emails.ts`, and sends through Resend. Details:
`docs/email-templates/README.md`.

**Requires GoTrue v2.147.1 or later** (check with
`curl -s https://<supabase-host>/auth/v1/health -H "apikey: <anon key>"`).

Generate one secret and use the same value on both sides:

```bash
echo "v1,whsec_$(openssl rand -base64 32)"
```

| Where | Variable | Value |
| --- | --- | --- |
| JustNoted app | `SEND_EMAIL_HOOK_SECRET` | the generated secret |
| JustNoted app | `RESEND_API_KEY` | Resend API key (already used by the contact form) |
| JustNoted app | `NEXT_PUBLIC_APP_URL` | e.g. `https://justnoted.app` (links in invite/recovery/email-change emails) |
| Supabase auth | `GOTRUE_HOOK_SEND_EMAIL_ENABLED` | `true` |
| Supabase auth | `GOTRUE_HOOK_SEND_EMAIL_URI` | `https://justnoted.app/api/auth/send-email-hook` |
| Supabase auth | `GOTRUE_HOOK_SEND_EMAIL_SECRETS` | the generated secret |

GoTrue only accepts an `https://` hook URI (plain `http://` is allowed only for
`localhost`, `127.0.0.1` or `host.docker.internal`), and gives the hook about 5
seconds. To rotate, set both secrets separated by `|` on both sides, then drop the
old one.

**Rollback:** if the app side is broken, redeploy the previous app build (the
hook config can stay). To stop GoTrue calling the hook, set
`GOTRUE_HOOK_SEND_EMAIL_ENABLED=false` and restart the auth service. With no
SMTP configured, GoTrue then can't send email at all, so pair that with Resend
SMTP as a break-glass fallback: `GOTRUE_SMTP_HOST=smtp.resend.com`,
`GOTRUE_SMTP_PORT=465`, `GOTRUE_SMTP_USER=resend`, `GOTRUE_SMTP_PASS=<Resend
API key>`, `GOTRUE_SMTP_ADMIN_EMAIL=hello@justnoted.app`,
`GOTRUE_SMTP_SENDER_NAME=JustNoted` (GoTrue's default templates, not ours).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
