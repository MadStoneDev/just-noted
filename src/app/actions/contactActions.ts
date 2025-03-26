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

    // Send email to admin
    const adminEmailResult = await sendEmailToAdmin(validatedData);
    if (!adminEmailResult.success) {
      return { success: false, error: "Failed to send admin notification" };
    }

    // Send confirmation email to user
    const userEmailResult = await sendEmailToUser(validatedData.email);
    if (!userEmailResult.success) {
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

async function sendEmailToAdmin({
  name,
  email,
  message,
}: Omit<FormData, "recaptchaToken">) {
  const apiKey = process.env.MAILERSEND_API;
  const templateId = "z3m5jgr130z4dpyo";

  // Prepare data for the template variables
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

  const emailData = {
    template_id: templateId,
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
    personalization: personalization,
    reply_to: {
      email: email,
      name: name || "Contact Form User",
    },
  };

  try {
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("MailerSend API error:", responseData);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending admin email:", error);
    return { success: false };
  }
}

async function sendEmailToUser(userEmail: string) {
  const apiKey = process.env.MAILERSEND_API;
  const templateId = "3zxk54v195z4jy6v";

  const emailData = {
    template_id: templateId,
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

  try {
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("MailerSend API error:", responseData);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending user confirmation email:", error);
    return { success: false };
  }
}
