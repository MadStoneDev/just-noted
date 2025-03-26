"use server";

import { z } from "zod";

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

    // Get API key
    const apiKey = process.env.MAILERSEND_API;
    if (!apiKey) {
      console.error("MailerSend API key is missing");
      return { success: false, error: "Email configuration error" };
    }

    // First, try sending the admin notification
    const adminResult = await sendAdminNotification(
      apiKey,
      validatedData.name || "Anonymous",
      validatedData.email,
      validatedData.message,
    );

    if (!adminResult.success) {
      return adminResult;
    }

    // If admin notification succeeded, send the user confirmation
    const userResult = await sendUserConfirmation(apiKey, validatedData.email);

    if (!userResult.success) {
      return userResult;
    }

    // Both emails sent successfully
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

async function sendAdminNotification(
  apiKey: string,
  name: string,
  email: string,
  message: string,
) {
  try {
    console.log("Preparing admin notification email...");

    // Prepare email data
    const emailData = {
      template_id: "z3m5jgr130z4dpyo",
      from: {
        email: "hello@justnoted.app",
        name: "Contact Form",
      },
      to: [
        {
          email: "hello@justnoted.app",
          name: "Just Noted",
        },
      ],
      reply_to: {
        email: email,
        name: name,
      },
      personalization: [
        {
          email: "hello@justnoted.app",
          data: {
            name: name,
            email: email,
            message: message,
          },
        },
      ],
    };

    // Send the email using fetch directly
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    const responseData = await response.json();

    // Log the full response for debugging
    console.log("Admin email API response:", {
      status: response.status,
      statusText: response.statusText,
      data: responseData,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to send admin notification: ${
          responseData.message || response.statusText
        }`,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error sending admin notification:", error);
    return {
      success: false,
      error: `Admin email error: ${error.message || "Unknown error"}`,
    };
  }
}

async function sendUserConfirmation(apiKey: string, userEmail: string) {
  try {
    console.log("Preparing user confirmation email...");

    // Prepare email data
    const emailData = {
      template_id: "3zxk54v195z4jy6v",
      from: {
        email: "hello@justnoted.app",
        name: "Just Noted",
      },
      to: [
        {
          email: userEmail,
        },
      ],
    };

    // Send the email using fetch directly
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    const responseData = await response.json();

    // Log the full response for debugging
    console.log("User email API response:", {
      status: response.status,
      statusText: response.statusText,
      data: responseData,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to send confirmation email: ${
          responseData.message || response.statusText
        }`,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error sending user confirmation:", error);
    return {
      success: false,
      error: `User email error: ${error.message || "Unknown error"}`,
    };
  }
}
