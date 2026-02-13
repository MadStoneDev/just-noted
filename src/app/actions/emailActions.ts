"use server";

import { z } from "zod";

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

function getAdminEmailHtml(name: string, email: string, score: number | undefined, message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #03BFB5 0%, #029e96 100%); padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Contact Form Submission</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6; font-weight: 600; width: 120px;">Name:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6; font-weight: 600;">Email:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">
          <a href="mailto:${escapeHtml(email)}" style="color: #03BFB5;">${escapeHtml(email)}</a>
        </td>
      </tr>
      ${score !== undefined ? `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6; font-weight: 600;">reCAPTCHA Score:</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">
          <span style="background: ${score >= 0.7 ? '#d4edda' : score >= 0.5 ? '#fff3cd' : '#f8d7da'}; padding: 2px 8px; border-radius: 4px; font-size: 14px;">
            ${score.toFixed(2)}
          </span>
        </td>
      </tr>
      ` : ''}
    </table>

    <div style="margin-top: 20px;">
      <h3 style="color: #03BFB5; margin-bottom: 10px;">Message:</h3>
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  </div>

  <p style="text-align: center; color: #6c757d; font-size: 12px; margin-top: 20px;">
    This email was sent from the Just Noted contact form.
  </p>
</body>
</html>
  `;
}

function getUserConfirmationHtml(email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank you for contacting Just Noted</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #03BFB5 0%, #029e96 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Just Noted</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Distraction-free note taking</p>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e9ecef; border-top: none;">
    <h2 style="color: #03BFB5; margin-top: 0;">Thank you for reaching out!</h2>

    <p>We've received your message and will get back to you as soon as possible.</p>

    <p>In the meantime, feel free to explore Just Noted and start capturing your thoughts with our distraction-free editor.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://justnoted.app" style="display: inline-block; background: #03BFB5; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Go to Just Noted
      </a>
    </div>

    <p style="color: #6c757d; font-size: 14px;">
      If you didn't submit a contact form on Just Noted, you can safely ignore this email.
    </p>
  </div>

  <p style="text-align: center; color: #6c757d; font-size: 12px; margin-top: 20px;">
    © ${new Date().getFullYear()} Just Noted. All rights reserved.
  </p>
</body>
</html>
  `;
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
    // 1. Validate form data
    const validatedData = FormSchema.parse(formData);

    // 2. Verify reCAPTCHA
    const recaptchaResult = await verifyRecaptcha(validatedData.recaptchaToken);
    if (!recaptchaResult.success) {
      return { success: false, error: "reCAPTCHA verification failed" };
    }

    // 3. Check API key
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is missing");
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
        body: `secret=${recaptchaSecret}&response=${token}`,
      },
    );

    const data = await response.json();

    console.log("reCaptcha verification:", {
      success: data.success,
      score: data.score,
      action: data.action,
      hostname: data.hostname,
      errors: data[`error-codes`],
    });

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
