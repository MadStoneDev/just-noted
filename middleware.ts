import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const config = {
  // Match all paths except for specified ones
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (/api/.*)
     * - Static files like images, js, css, etc.
     */
    "/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export async function middleware(request: NextRequest) {
  // Get the bot information from the User-Agent
  const botInfo = request.headers.get("x-vercel-bot");
  const isBot = botInfo ? JSON.parse(botInfo).isBot : false;

  // Start with a basic NextResponse
  let response = NextResponse.next();

  // Add bot detection information to response headers
  response.headers.set("x-is-bot", isBot.toString());

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set the cookie in the response
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // Remove the cookie from the response
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    },
  );

  // Refresh the session
  await supabase.auth.getSession();

  return response;
}
