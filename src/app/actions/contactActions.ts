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

// Fun error messages
const funnyErrors = [
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
];

// Get a random funny error message
function getRandomErrorMessage() {
  const randomIndex = Math.floor(Math.random() * funnyErrors.length);
  return funnyErrors[randomIndex];
}

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
      return { success: false, error: getRandomErrorMessage() };
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
        console.error("Admin email failed:", adminResult.error);
        return { success: false, error: getRandomErrorMessage() };
      }

      // Try to send user confirmation but don't fail the whole process if it fails
      try {
        await sendUserEmail(apiKey, validatedData.email);
      } catch (userEmailError) {
        // Just log the error but don't expose to user or fail the process
        console.error("User email failed but continuing:", userEmailError);
        // We'll still return success even if confirmation email fails
      }

      // Return success even if user email might have failed
      return { success: true };
    } catch (error: any) {
      console.error("Error in email process:", error);
      return { success: false, error: getRandomErrorMessage() };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0]?.message || "Form validation failed";
      return { success: false, error: errorMessage };
    }

    console.error("Contact form error:", error);
    return { success: false, error: getRandomErrorMessage() };
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
      // Log details for debugging but don't expose them
      if (error.response && error.response.data) {
        console.error("API error response:", error.response.data);
      }
      return { success: false, error: "Failed to send admin notification" };
    }
  } catch (error: any) {
    console.error("Exception in admin email function:", error);
    return { success: false, error: "Admin email error" };
  }
}

async function sendUserEmail(apiKey: string, userEmail: string) {
  try {
    console.log("Sending user confirmation...");

    const mailerSend = new MailerSend({
      apiKey: apiKey,
    });

    const sentFrom = new Sender("hello@justnoted.app", "Just Noted");
    const replyTo = new Sender("no-reply@justnoted.app", "Just Noted");
    const recipients = [new Recipient(userEmail, "User")];

    const personalization = [
      {
        email: userEmail,
        data: {
          user_email: userEmail,
        },
      },
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setReplyTo(replyTo)
      .setSubject("Just Noted - Thank you for your message!")
      .setTemplateId("3zxk54v195z4jy6v")
      .setPersonalization(personalization);

    console.log("User email params prepared");

    try {
      console.log("Sending user email...");
      const response = await mailerSend.email.send(emailParams);
      console.log("User email sent successfully:", response);
      return { success: true };
    } catch (error: any) {
      // Log the detailed error for debugging but don't return it
      console.error("Error sending user email:", error);
      if (error.response && error.response.data) {
        console.error("API error response:", error.response.data);
      }
      throw error; // Re-throw to be caught by the outer try-catch
    }
  } catch (error: any) {
    console.error("Exception in user email function:", error);
    throw error; // Re-throw to be caught by the outer try-catch
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
