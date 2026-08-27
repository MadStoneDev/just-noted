"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { checkRateLimit } from "@/utils/rate-limit";

// ===========================
// VALIDATION SCHEMA
// ===========================

const FormSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(1, "Please enter a message"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
});

type FormData = z.infer<typeof FormSchema>;

// ===========================
// ERROR MESSAGES
// ===========================

const FUNNY_ERRORS = [
  "Oops! Our carrier pigeons got lost in the digital storm. Please try again.",
  "Well, this is awkward... Our email elves are on coffee break. Mind trying again?",
  "Houston, we have a problem! Your message got sucked into a black hole. One more try?",
  "Message transmission intercepted by space cats. They're not sharing. Try again?",
  "Our email hamsters fell off their wheels. Give them another chance to run?",
  "The internet gnomes misplaced your message. They're very sorry. Try again?",
  "Email machine went 'boop-beep' instead of 'beep-boop'. Please re-submit!",
  "Your message tried to swim across the internet but forgot its floaties. Another go?",
  "That's odd... our system hiccupped while sending. Care to try again?",
  "Email delivery status: it's complicated. Let's give it another shot, shall we?",
] as const;

function getRandomErrorMessage(): string {
  return FUNNY_ERRORS[Math.floor(Math.random() * FUNNY_ERRORS.length)];
}

// ===========================
// EMAIL CONFIGURATION
// ===========================

const EMAIL_CONFIG = {
  FROM: "Just Noted <hello@justnoted.app>",
  TO_ADMIN: "hello@justnoted.app",
  NO_REPLY: "Just Noted <no-reply@justnoted.app>",
} as const;

// ===========================
// EMAIL TEMPLATES (HTML)
// ===========================

// Shared branded shell: a centered white card on a soft ground, a "Just Noted"
// serif wordmark, and a quiet footer. `content` is the inner body HTML.
function emailShell(opts: { preheader: string; content: string; maxWidth?: number }): string {
  const { preheader, content, maxWidth = 520 } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f7f7;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f7f7;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;background:#ffffff;border:1px solid #ececec;border-radius:14px;">
          <tr>
            <td style="padding:32px 36px 0;">
              <span style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#03BFB5;letter-spacing:-0.01em;">Just Noted</span>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;">
              ${content}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;">
          <tr>
            <td align="center" style="padding:18px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9aa0a0;">
              Just Noted &middot; <a href="https://justnoted.app" style="color:#9aa0a0;text-decoration:underline;">justnoted.app</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getAdminEmailHtml(name: string, email: string, score: number | undefined, message: string): string {
  const scoreColor = score === undefined ? "" : score >= 0.7 ? "#059a93" : score >= 0.5 ? "#b45309" : "#dc2626";
  return emailShell({
    preheader: `New contact message from ${escapeHtml(name)}`,
    content: `
      <p style="margin:0 0 4px;font-size:17px;font-weight:600;">New contact message</p>
      <p style="margin:0 0 22px;color:#6b6b6b;font-size:14px;">Sent through the Just Noted contact form.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;color:#6b6b6b;width:110px;vertical-align:top;">From</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;color:#6b6b6b;vertical-align:top;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;"><a href="mailto:${escapeHtml(email)}" style="color:#03BFB5;text-decoration:none;">${escapeHtml(email)}</a></td>
        </tr>${score !== undefined ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;color:#6b6b6b;vertical-align:top;">reCAPTCHA</td>
          <td style="padding:10px 0;border-bottom:1px solid #eef1f1;color:${scoreColor};font-weight:600;">${score.toFixed(2)}</td>
        </tr>` : ""}
      </table>
      <p style="margin:24px 0 8px;color:#6b6b6b;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
      <div style="background:#f7f9f9;border:1px solid #eef1f1;border-radius:10px;padding:18px;white-space:pre-wrap;font-size:15px;line-height:1.6;">${escapeHtml(message)}</div>
    `,
  });
}

function getUserConfirmationHtml(_email: string): string {
  return emailShell({
    preheader: "Thanks for reaching out — we've got your message.",
    content: `
      <p style="margin:0 0 16px;">Hi,</p>
      <p style="margin:0 0 16px;">Thanks for reaching out. We've got your message and we'll get back to you as soon as we can.</p>
      <p style="margin:0 0 24px;">In the meantime, feel free to keep writing.</p>
      <p style="margin:0 0 28px;">
        <a href="https://justnoted.app" style="display:inline-block;background:#03BFB5;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open Just Noted</a>
      </p>
      <p style="margin:0 0 16px;color:#6b6b6b;font-size:14px;">If you didn't contact Just Noted, you can safely ignore this email — no action is needed.</p>
      <p style="margin:0;">Best regards,<br>Just Noted</p>
    `,
  });
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ===========================
// MAIN SUBMIT FUNCTION
// ===========================

export async function submitContactForm(formData: FormData) {
  try {
    // 0. Rate limit per IP so the endpoint can't be used as an email-spam relay
    //    (reCAPTCHA v3 is score-based, not a hard block).
    const hdrs = await headers();
    const ip =
      (hdrs.get("x-forwarded-for") || "").split(",")[0].trim() ||
      hdrs.get("x-real-ip") ||
      "unknown";
    const rl = await checkRateLimit(ip, "contact", 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return {
        success: false,
        error: "Too many requests. Please try again later.",
      };
    }

    // 1. Validate form data
    const validatedData = FormSchema.parse(formData);

    // 2. Verify reCAPTCHA
    const recaptchaResult = await verifyRecaptcha(validatedData.recaptchaToken);
    if (!recaptchaResult.success) {
      return { success: false, error: "reCAPTCHA verification failed" };
    }

    // 3. Check API key
    // Accept either RESEND_API_KEY or the shorter RESEND env var name.
    const apiKey = process.env.RESEND_API_KEY || process.env.RESEND;
    if (!apiKey) {
      console.error("RESEND_API_KEY / RESEND is missing");
      return { success: false, error: getRandomErrorMessage() };
    }

    // 4. Send admin notification (critical)
    const adminResult = await sendAdminEmail(
      apiKey,
      validatedData.name || "Anonymous",
      validatedData.email,
      recaptchaResult.score,
      validatedData.message,
    );

    if (!adminResult.success) {
      console.error("Admin email failed:", adminResult.error);
      return { success: false, error: getRandomErrorMessage() };
    }

    // 5. Send user confirmation (non-critical)
    await sendUserEmail(apiKey, validatedData.email).catch((error) => {
      console.error("User confirmation email failed (non-critical):", error);
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0]?.message || "Form validation failed";
      return { success: false, error: errorMessage };
    }

    console.error("Contact form submission error:", error);
    return { success: false, error: getRandomErrorMessage() };
  }
}

// ===========================
// EMAIL SENDING FUNCTIONS (RESEND)
// ===========================

async function sendAdminEmail(
  apiKey: string,
  name: string,
  email: string,
  score: number | undefined,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_CONFIG.FROM,
        to: [EMAIL_CONFIG.TO_ADMIN],
        reply_to: email,
        subject: `Just Noted Contact: ${name}`,
        html: getAdminEmailHtml(name, email, score, message),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Resend API error:", errorData);
      return {
        success: false,
        error: "Failed to send admin notification",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Admin email failed:", error);
    return {
      success: false,
      error: "Failed to send admin notification",
    };
  }
}

async function sendUserEmail(apiKey: string, userEmail: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_CONFIG.FROM,
      to: [userEmail],
      reply_to: "no-reply@justnoted.app",
      subject: "Thank you for contacting Just Noted!",
      html: getUserConfirmationHtml(userEmail),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
  }
}

// ===========================
// RECAPTCHA VERIFICATION
// ===========================

async function verifyRecaptcha(
  token: string,
): Promise<{ success: boolean; score?: number; error?: string }> {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

  if (!recaptchaSecret) {
    console.error("RECAPTCHA_SECRET_KEY is missing");
    return { success: false, error: "Configuration error" };
  }

  try {
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: recaptchaSecret,
          response: token ?? "",
        }).toString(),
      },
    );

    const data = await response.json();


    if (data.success && data.score !== undefined) {
      if (data.score < 0.7) {
        return {
          success: false,
          score: data.score,
          error: "Low reCAPTCHA score",
        };
      }
    }

    const expectedHostname =
      process.env.NEXT_PUBLIC_SITE_DOMAIN || "justnoted.app";
    if (data.hostname && !data.hostname.includes(expectedHostname)) {
      console.error("Hostname mismatch:", data.hostname);
      return { success: false, score: 0, error: "Invalid hostname" };
    }

    return {
      success: data.success,
      score: data.score,
    };
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return { success: false, error: "Verification failed" };
  }
}
