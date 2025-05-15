"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

type AuthResponse = {
  error: string | null;
  success: boolean;
  redirectTo?: string;
  debug?: any; // For debugging only, remove in production
};

export async function handleAuth(formData: FormData): Promise<AuthResponse> {
  const email = formData.get("email") as string;
  console.log("Auth attempt for email:", email);

  if (!email) {
    return {
      error: "Please enter your email address to continue.",
      success: false,
    };
  }

  try {
    console.log("Creating Supabase client...");
    const supabase = await createClient();
    console.log("Supabase client created successfully");

    // Try to get the current user first to check if authentication works at all
    try {
      console.log("Testing Supabase connection with getUser...");
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      console.log("Get user result:", userData ? "Success" : "No user found");
      if (userError) {
        console.error("Error with getUser:", userError);
      }
    } catch (testError) {
      console.error("Test connection failed:", testError);
    }

    // Log supabase auth object properties (safely)
    console.log(
      "Supabase auth methods available:",
      Object.keys(supabase.auth).filter(
        (k) => typeof supabase.auth === "function",
      ),
    );

    console.log("Attempting to sign in with OTP...");

    // Attempt with try/catch to get clearer error
    try {
      const signInResult = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      console.log("OTP response received:", {
        success: !signInResult.error,
        errorCode: signInResult.error?.status,
        errorName: signInResult.error?.name,
      });

      const { error: authError } = signInResult;

      if (authError) {
        console.error("Supabase auth error details:", {
          message: authError.message,
          status: authError.status,
          name: authError.name,
          stack: authError.stack,
          code: authError.code,
          // Log all properties for debugging
          allProps: Object.keys(authError),
        });

        // Attempt to parse the error if it's stringified JSON
        try {
          if (
            typeof authError.message === "string" &&
            (authError.message.startsWith("{") ||
              authError.message.startsWith("["))
          ) {
            const parsedError = JSON.parse(authError.message);
            console.log("Parsed error message:", parsedError);
          }
        } catch (parseError) {
          // Ignore parsing errors
        }

        if (authError.message.includes("Database error")) {
          return {
            error:
              "There was an issue with our database. Please try again later.",
            success: false,
            debug: authError,
          };
        }

        if (authError.message.includes("Invalid email")) {
          return {
            error: "Please enter a valid email address.",
            success: false,
          };
        }

        if (authError.message.includes("rate limit")) {
          return {
            error:
              "Too many attempts. Please wait a few minutes before trying again.",
            success: false,
          };
        }

        return {
          error: `Authentication error: ${authError.message}`,
          success: false,
          debug: authError,
        };
      }

      console.log("OTP sent successfully");
      revalidatePath("/");

      return {
        error: null,
        success: true,
      };
    } catch (innerError) {
      console.error("Inner exception during signInWithOtp:", innerError);
      return {
        error: "Critical error during authentication. Please try again.",
        success: false,
        debug: innerError,
      };
    }
  } catch (error) {
    console.error("Unexpected error during authentication:", error);
    // Log the full error details
    try {
      console.error(
        "Error details:",
        JSON.stringify(error, Object.getOwnPropertyNames(error)),
      );
    } catch (jsonError) {
      console.error("Error couldn't be stringified:", error);
    }

    return {
      error: "An unexpected error occurred. Please try again later.",
      success: false,
      debug: error,
    };
  }
}

export async function verifyOtp(formData: FormData): Promise<AuthResponse> {
  const email = formData.get("email") as string;
  const otp = formData.get("otp") as string;
  const redisUserId = (formData.get("redisUserId") as string) || null;

  if (!email || !otp) {
    return {
      error: "Missing email or verification code",
      success: false,
    };
  }

  try {
    const supabase = await createClient();

    const { data: authData, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      console.error("OTP verification error:", error);

      if (error.message.includes("Invalid OTP")) {
        return {
          error:
            "Incorrect verification code. Please double-check and try again.",
          success: false,
        };
      }

      if (error.message.includes("expired")) {
        return {
          error:
            "This verification code has expired. Please request a new one.",
          success: false,
        };
      }

      return {
        error: "Verification failed. Please try again.",
        success: false,
      };
    }

    // If authentication was successful and we have a Redis user ID,
    // associate it with the user's account
    if (authData?.user && redisUserId) {
      try {
        // Check if user already has an author record
        const { data: existingAuthor, error: authorError } = await supabase
          .from("authors")
          .select("id, redis_user_id")
          .eq("id", authData.user.id)
          .single();

        if (authorError && authorError.code !== "PGRST116") {
          // Some error other than "not found"
          console.error("Error checking for existing author:", authorError);
        } else if (existingAuthor) {
          // Author exists but may need redis_user_id update
          if (!existingAuthor.redis_user_id) {
            const { error: updateError } = await supabase
              .from("authors")
              .update({ redis_user_id: redisUserId })
              .eq("id", authData.user.id);

            if (updateError) {
              console.error("Error updating redis_user_id:", updateError);
            } else {
              console.log("Updated author with Redis user ID:", redisUserId);
            }
          }
        } else {
          // Author doesn't exist, create it with the Redis user ID
          // This is a fallback - your trigger should normally create it
          const { error: insertError } = await supabase.from("authors").insert({
            id: authData.user.id,
            redis_user_id: redisUserId,
            username: `user_${Math.floor(Math.random() * 10000)}`,
            created_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          });

          if (insertError) {
            console.error("Error creating author record:", insertError);
          } else {
            console.log("Created new author with Redis user ID:", redisUserId);
          }
        }
      } catch (authorError) {
        // Log but don't fail the auth process
        console.error("Error associating Redis user ID:", authorError);
      }
    }

    revalidatePath("/");

    // Redirect to profile page after successful verification
    return {
      error: null,
      success: true,
      redirectTo: "/profile",
    };
  } catch (error) {
    console.error("Unexpected error during OTP verification:", error);
    return {
      error: "An unexpected error occurred. Please try again later.",
      success: false,
    };
  }
}
