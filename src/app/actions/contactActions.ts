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
    const apiKey = process.env.MAILERSEND_API;
    if (!apiKey) {
      console.error("MailerSend API key is missing");
      return { success: false, error: "Email configuration error" };
    }

    try {
      // Send admin notification
      const adminResult = await sendAdminEmail(
        apiKey,
        validatedData.name || "Anonymous",
        validatedData.email,
        validatedData.message,
      );

      if (!adminResult.success) {
        return adminResult;
      }

      // Send user confirmation
      const userResult = await sendUserEmail(apiKey, validatedData.email);

      if (!userResult.success) {
        return userResult;
      }

      return { success: true };
    } catch (error: any) {
      console.error("Error in email process:", error);
      return {
        success: false,
        error: `Email error: ${error.message || "Unknown error"}`,
      };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0]?.message || "Form validation failed";
      return { success: false, error: errorMessage };
    }

    console.error("Contact form error:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

async function sendAdminEmail(
  apiKey: string,
  name: string,
  email: string,
  message: string,
) {
  try {
    console.log("Sending admin notification...");

    const mailerSend = new MailerSend({
      apiKey: apiKey,
    });

    const sentFrom = new Sender("hello@justnoted.app", "Contact Form");
    const recipients = [new Recipient("hello@justnoted.app", "Just Noted")];

    // Using personalization for template data
    const personalization = [
      {
        email: "hello@justnoted.app",
        data: {
          name: name,
          email: email,
          message: message,
        },
      },
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setReplyTo(new Sender(email, name))
      .setTemplateId("z3m5jgr130z4dpyo")
      .setSubject("Just Noted - Admin Notification")
      .setPersonalization(personalization);

    console.log("Admin email params prepared");

    try {
      console.log("Sending admin email...");
      const response = await mailerSend.email.send(emailParams);
      console.log("Admin email sent successfully:", response);
      return { success: true };
    } catch (error: any) {
      console.error("Error sending admin email:", error);

      // Try to extract detailed error information
      let errorDetails = "Unknown error";
      if (error.response && error.response.data) {
        errorDetails = JSON.stringify(error.response.data);
      } else if (error.message) {
        errorDetails = error.message;
      }

      return {
        success: false,
        error: `Failed to send admin notification: ${errorDetails}`,
      };
    }
  } catch (error: any) {
    console.error("Exception in admin email function:", error);
    return { success: false, error: `Admin email error: ${error.message}` };
  }
}

async function sendUserEmail(apiKey: string, userEmail: string) {
  try {
    console.log("Sending user confirmation...");

    const mailerSend = new MailerSend({
      apiKey: apiKey,
    });

    const sentFrom = new Sender("hello@justnoted.app", "Just Noted");
    const recipients = [new Recipient(userEmail)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Just Noted - Thank you for your message!")
      .setTemplateId("3zxk54v195z4jy6v");

    console.log("User email params prepared");

    try {
      console.log("Sending user email...");
      const response = await mailerSend.email.send(emailParams);
      console.log("User email sent successfully:", response);
      return { success: true };
    } catch (error: any) {
      console.error("Error sending user email:", error);

      let errorDetails = "Unknown error";
      if (error.response && error.response.data) {
        errorDetails = JSON.stringify(error.response.data);
      } else if (error.message) {
        errorDetails = error.message;
      }

      return {
        success: false,
        error: `Failed to send confirmation email: ${errorDetails}`,
      };
    }
  } catch (error: any) {
    console.error("Exception in user email function:", error);
    return { success: false, error: `User email error: ${error.message}` };
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
