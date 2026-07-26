import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

/**
 * Validates that a redirect URL is safe (relative path only)
 * Prevents open redirect attacks
 */
function isUnsafePath(url: string): boolean {
  // Reject protocol-relative (//host) and backslash variants (\host, /\host)
  // which browsers normalise to // and treat as protocol-relative.
  if (!url.startsWith("/")) return true;
  if (url.startsWith("//") || url.startsWith("/\\") || url.startsWith("\\")) return true;
  if (url.includes("\\")) return true;
  if (url.includes("://")) return true;
  return false;
}

function isValidRedirectUrl(url: string): boolean {
  if (isUnsafePath(url)) return false;
  // Also validate the decoded form to catch encoded bypasses.
  try {
    if (isUnsafePath(decodeURIComponent(url))) return false;
  } catch {
    // If decoding fails, reject the URL
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";

  // Validate redirect URL to prevent open redirect attacks
  const next = isValidRedirectUrl(nextParam) ? nextParam : "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    }
  }

  // redirect the user to an error page with some instructions
  redirect("/error");
}
