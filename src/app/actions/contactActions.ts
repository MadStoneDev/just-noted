"use server";

import { z } from "zod";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

// Define validation schema for the form data
const FormSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(1, "Please enter a message"),
  recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
});

type FormData = z.infer<typeof FormSchema>;

export async function submitContactForm(formData: FormData) {
  try {
    // Validate form data
    const validatedData = FormSchema.parse(formData);

    // Verify reCAPTCHA token
    const recaptchaResponse = await verifyRecaptcha(
      validatedData.recaptchaToken,
    );
    if (!recaptchaResponse.success) {
      return { success: false, error: "reCAPTCHA verification failed" };
    }

    // Initialize MailerSend with API key
    const mailerSend = new MailerSend({
      apiKey: process.env.MAILERSEND_API || "",
    });

    // Send email to admin
    try {
      await sendEmailToAdmin(mailerSend, validatedData);
    } catch (error) {
      console.error("Error sending admin notification:", error);
      return { success: false, error: "Failed to send admin notification" };
    }

    // Send confirmation email to user
    try {
      await sendEmailToUser(mailerSend, validatedData.email);
    } catch (error) {
      console.error("Error sending confirmation email:", error);
      return { success: false, error: "Failed to send confirmation email" };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0]?.message || "Form validation failed";
      return { success: false, error: errorMessage };
    }

    console.error("Contact form error:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

async function verifyRecaptcha(token: string) {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

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
}

async function sendEmailToAdmin(
  mailerSend: MailerSend,
  { name, email, message }: Omit<FormData, "recaptchaToken">,
) {
  // Using template
  const templateId = "z3m5jgr130z4dpyo";

  const sentFrom = new Sender("hello@justnoted.app", "Just Noted Contact Form");
  const recipients = [new Recipient("hello@justnoted.app", "Just Noted")];

  const personalization = [
    {
      email: "hello@justnoted.app",
      data: {
        name: name || "Anonymous",
        email: email,
        message: message,
      },
    },
  ];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setReplyTo(new Sender(email, name || "Contact Form User"))
    .setTemplateId(templateId)
    .setPersonalization(personalization);

  // More detailed error handling with the SDK
  const response = await mailerSend.email.send(emailParams);
  console.log("Admin email response:", response);
  return response;
}

async function sendEmailToUser(mailerSend: MailerSend, userEmail: string) {
  const templateId = "3zxk54v195z4jy6v";

  const sentFrom = new Sender("hello@justnoted.app", "Just Noted");
  const recipients = [new Recipient(userEmail)];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setTemplateId(templateId);

  const response = await mailerSend.email.send(emailParams);
  console.log("User confirmation email response:", response);
  return response;
}
