import { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export async function middleware(request: NextRequest) {
  // Get the bot information from the User-Agent
  const botInfo = request.headers.get("x-vercel-bot");
  const isBot = botInfo ? JSON.parse(botInfo).isBot : false;

  // Add bot detection information to the request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-is-bot", isBot.toString());

  const requestWithBotHeader = new NextRequest(request.url, {
    headers: requestHeaders,
    method: request.method,
  });

  return await updateSession(requestWithBotHeader);
}
