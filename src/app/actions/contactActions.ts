"use server";

import { z } from "zod";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

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
  FROM: "hello@justnoted.app",
  FROM_NAME: "Just Noted",
  TO_ADMIN: "hello@justnoted.app",
  TO_ADMIN_NAME: "Just Noted",
  NO_REPLY: "no-reply@justnoted.app",
  ADMIN_TEMPLATE_ID: "z3m5jgr130z4dpyo",
  USER_TEMPLATE_ID: "3zxk54v195z4jy6v",
} as const;

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
    const apiKey = process.env.MAILERSEND_API;
    if (!apiKey) {
      console.error("MAILERSEND_API key is missing");
      return { success: false, error: getRandomErrorMessage() };
    }

    // 4. Send admin notification (critical)
    const adminResult = await sendAdminEmail(
      apiKey,
      validatedData.name || "Anonymous",
      validatedData.email,
      validatedData.message,
    );

    if (!adminResult.success) {
      console.error("Admin email failed:", adminResult.error);
      return { success: false, error: getRandomErrorMessage() };
    }

    // 5. Send user confirmation (non-critical)
    // If this fails, we still report success to the user
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
// EMAIL SENDING FUNCTIONS
// ===========================

async function sendAdminEmail(
  apiKey: string,
  name: string,
  email: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const mailerSend = new MailerSend({ apiKey });

    const emailParams = new EmailParams()
      .setFrom(new Sender(EMAIL_CONFIG.FROM, EMAIL_CONFIG.FROM_NAME))
      .setTo([new Recipient(EMAIL_CONFIG.TO_ADMIN, EMAIL_CONFIG.TO_ADMIN_NAME)])
      .setReplyTo(new Sender(email, name))
      .setTemplateId(EMAIL_CONFIG.ADMIN_TEMPLATE_ID)
      .setSubject("Just Noted - Admin Notification")
      .setPersonalization([
        {
          email: EMAIL_CONFIG.TO_ADMIN,
          data: { name, email, message },
        },
      ]);

    await mailerSend.email.send(emailParams);

    return { success: true };
  } catch (error: any) {
    console.error("❌ Admin email failed:", error);
    if (error.response?.data) {
      console.error("API error details:", error.response.data);
    }
    return {
      success: false,
      error: "Failed to send admin notification",
    };
  }
}

async function sendUserEmail(apiKey: string, userEmail: string): Promise<void> {
  const mailerSend = new MailerSend({ apiKey });

  const emailParams = new EmailParams()
    .setFrom(new Sender(EMAIL_CONFIG.FROM, EMAIL_CONFIG.FROM_NAME))
    .setTo([new Recipient(userEmail, "User")])
    .setReplyTo(new Sender(EMAIL_CONFIG.NO_REPLY, EMAIL_CONFIG.FROM_NAME))
    .setSubject("Just Noted - Thank you for your message!")
    .setTemplateId(EMAIL_CONFIG.USER_TEMPLATE_ID)
    .setPersonalization([
      {
        email: userEmail,
        data: { user_email: userEmail },
      },
    ]);

  await mailerSend.email.send(emailParams);
}

// ===========================
// RECAPTCHA VERIFICATION
// ===========================

async function verifyRecaptcha(token: string): Promise<{ success: boolean }> {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

  if (!recaptchaSecret) {
    console.error("RECAPTCHA_SECRET_KEY is missing");
    return { success: false };
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

    return await response.json();
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return { success: false };
  }
}
