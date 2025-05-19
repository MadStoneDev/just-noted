"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type AuthResponse = {
  error: string | null;
  success: boolean;
  redirectTo?: string;
};

export async function handleAuth(formData: FormData): Promise<AuthResponse> {
  const email = formData.get("email") as string;

  if (!email) {
    return {
      error: "Oops! No email? Try again.",
      success: false,
    };
  }

  try {
    const supabase = await createClient();

    // Try a different auth method first - see if it's more reliable
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${
          process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
        }/auth/callback`,
      },
    });

    console.log("Auth attempt result:", {
      success: !error,
      errorMessage: error?.message,
      errorStatus: error?.status,
      errorCode: error?.code,
    });

    if (error) {
      console.error("Supabase auth error details:", {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      if (error.message.includes("Invalid email")) {
        return {
          error: "Please enter a valid email address.",
          success: false,
        };
      }

      if (error.message.includes("rate limit")) {
        return {
          error:
            "Too many attempts. Please wait a few minutes before trying again.",
          success: false,
        };
      }

      // For general auth errors, provide a more detailed message
      return {
        error: `Authentication error (${error.code}): ${error.message}. Please try again later.`,
        success: false,
      };
    }

    revalidatePath("/");

    return {
      error: null,
      success: true,
    };
  } catch (error: any) {
    console.error("Unexpected error during authentication:", error);
    return {
      error: `Error sending login email: ${
        error?.message || "Unknown error"
      }. Please try again later.`,
      success: false,
    };
  }
}

export async function verifyOtp(formData: FormData): Promise<AuthResponse> {
  const email = formData.get("email") as string;
  const otp = formData.get("otp") as string;

  if (!email || !otp) {
    return {
      error: "Missing email or verification code",
      success: false,
    };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      console.error("OTP verification error:", {
        message: error.message,
        status: error.status,
        code: error.code,
      });

      if (error.message.includes("Invalid OTP")) {
        return {
          error: "That code isn't right. Double-check and try again.",
          success: false,
        };
      }

      if (error.message.includes("expired")) {
        return {
          error: "This code has expired. Please request a new one.",
          success: false,
        };
      }

      return {
        error: `Verification failed (${error.code}): ${error.message}. Please try again.`,
        success: false,
      };
    }

    revalidatePath("/");

    // Redirect to user profile after successful verification
    return {
      error: null,
      success: true,
      redirectTo: "/me",
    };
  } catch (error: any) {
    console.error("Unexpected error during OTP verification:", error);
    return {
      error: `Verification error: ${
        error?.message || "Unknown error"
      }. Please try again later.`,
      success: false,
    };
  }
}
