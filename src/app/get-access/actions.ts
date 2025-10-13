"use server";

import { revalidatePath } from "next/cache";
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

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3045";

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });

    if (error) {
      console.error("Supabase auth error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
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

      // Return the actual error message for debugging
      return {
        error: `Error (${error.code}): ${error.message}`,
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

    // More detailed error
    return {
      error: `Authentication error: ${error?.message || "Unknown error"}`,
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
        error: `Verification failed (${error.code}): ${error.message}`,
        success: false,
      };
    }

    revalidatePath("/");

    // Redirect to user profile after successful verification
    return {
      error: null,
      success: true,
      redirectTo: "/",
    };
  } catch (error: any) {
    console.error("Unexpected error during OTP verification:", error);
    return {
      error: `Verification error: ${error?.message || "Unknown error"}`,
      success: false,
    };
  }
}
